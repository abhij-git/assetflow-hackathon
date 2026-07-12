from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from fastapi import HTTPException, status
from app.models.models import Asset, BookableResource, Booking, BookingStatus, AssetStatus, User
from app.schemas.schemas import BookingCreate
from app.services.log_notification import create_activity_log, create_notification
from datetime import datetime, timezone

async def create_booking(db: AsyncSession, booking_in: BookingCreate, actor_id: int) -> Booking:
    # 1. Fetch resource and asset
    res_result = await db.execute(
        select(BookableResource).where(BookableResource.id == booking_in.resource_id)
    )
    resource = res_result.scalars().first()
    if not resource:
        raise HTTPException(status_code=404, detail="Bookable resource not found")

    asset_res = await db.execute(select(Asset).where(Asset.id == resource.asset_id))
    asset = asset_res.scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Associated asset not found")

    # 2. Check if asset availability is gated by maintenance/status
    if asset.status == AssetStatus.UnderMaintenance:
        raise HTTPException(
            status_code=400,
            detail=f"Resource {resource.name} is currently Under Maintenance and cannot be booked."
        )
    elif asset.status in [AssetStatus.Lost, AssetStatus.Retired, AssetStatus.Disposed]:
        raise HTTPException(
            status_code=400,
            detail=f"Resource {resource.name} is not available (Status: {asset.status})."
        )

    # 3. Check time validity
    if booking_in.start_time >= booking_in.end_time:
        raise HTTPException(status_code=400, detail="Start time must be before end time.")

    # 4. Overlap booking validation
    # Check for non-cancelled bookings where start < new_end and end > new_start
    conflict_query = await db.execute(
        select(Booking).where(
            and_(
                Booking.resource_id == booking_in.resource_id,
                Booking.status != BookingStatus.Cancelled,
                Booking.start_time < booking_in.end_time,
                Booking.end_time > booking_in.start_time
            )
        )
    )
    conflict = conflict_query.scalars().first()
    if conflict:
        # Fetch occupant details
        user_res = await db.execute(select(User).where(User.id == conflict.booked_by))
        u = user_res.scalars().first()
        occupant_name = u.name if u else f"User ID {conflict.booked_by}"
        conflict_msg = (
            f"Requested {booking_in.start_time.strftime('%H:%M')}–{booking_in.end_time.strftime('%H:%M')} — "
            f"conflict — slot is unavailable. Currently booked by {occupant_name} "
            f"from {conflict.start_time.strftime('%H:%M')} to {conflict.end_time.strftime('%H:%M')}."
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": conflict_msg,
                "conflict_start": conflict.start_time.isoformat(),
                "conflict_end": conflict.end_time.isoformat(),
                "booked_by": occupant_name
            }
        )

    # 5. Create Booking
    new_booking = Booking(
        resource_id=booking_in.resource_id,
        booked_by=actor_id,
        start_time=booking_in.start_time,
        end_time=booking_in.end_time,
        status=BookingStatus.Upcoming,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_booking)
    await db.flush()

    # Log and notify
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="BOOKING_CREATE",
        entity_type="Booking",
        entity_id=new_booking.id,
        details={
            "resource_id": booking_in.resource_id,
            "start_time": booking_in.start_time.isoformat(),
            "end_time": booking_in.end_time.isoformat()
        }
    )

    await create_notification(
        db,
        user_id=actor_id,
        type="BookingConfirmed",
        message=f"Booking confirmed for {resource.name} on {booking_in.start_time.strftime('%b %d, %H:%M')}.",
        related_entity_type="Booking",
        related_entity_id=new_booking.id
    )

    await db.commit()
    return new_booking

async def cancel_booking(db: AsyncSession, booking_id: int, actor_id: int) -> Booking:
    booking_res = await db.execute(select(Booking).where(Booking.id == booking_id))
    booking = booking_res.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking.status == BookingStatus.Cancelled:
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    booking.status = BookingStatus.Cancelled

    # Log and notify
    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="BOOKING_CANCEL",
        entity_type="Booking",
        entity_id=booking.id,
        details={}
    )

    await create_notification(
        db,
        user_id=booking.booked_by,
        type="BookingCancelled",
        message="Your booking has been cancelled.",
        related_entity_type="Booking",
        related_entity_id=booking.id
    )

    await db.commit()
    return booking
