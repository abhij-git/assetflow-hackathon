from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import User, UserRole, BookableResource, Booking, BookingStatus, Asset
from app.schemas.schemas import BookingCreate, BookingOut, ResourceOut
from app.services.booking import create_booking, cancel_booking
from datetime import datetime, date, time, timezone
from typing import List, Optional

router = APIRouter()

# --- RESOURCES ---

@router.get("/resources", response_model=List[ResourceOut])
async def list_resources(db: AsyncSession = Depends(get_db)):
    query = select(BookableResource).options(joinedload(BookableResource.asset))
    res = await db.execute(query)
    resources = res.scalars().all()
    
    out = []
    for r in resources:
        out.append(ResourceOut(
            id=r.id,
            asset_id=r.asset_id,
            asset_tag=r.asset.tag,
            name=r.name,
            description=r.description
        ))
    return out

# --- BOOKINGS ---

@router.get("", response_model=List[BookingOut])
async def list_bookings(
    resource_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Booking).options(
        joinedload(Booking.resource),
        joinedload(Booking.user)
    )
    filters = []
    
    if resource_id:
        filters.append(Booking.resource_id == resource_id)
        
    # Role-based filter
    if current_user.role == UserRole.Employee:
        filters.append(Booking.booked_by == current_user.id)
    elif current_user.role == UserRole.DeptHead:
        # Dept head can see bookings made by department members
        sub = select(User.id).where(User.department_id == current_user.department_id)
        filters.append(Booking.booked_by.in_(sub))
        
    if filters:
        query = query.where(and_(*filters))
        
    query = query.order_by(Booking.start_time.asc())
    res = await db.execute(query)
    bookings = res.scalars().all()
    
    out = []
    for b in bookings:
        out.append(BookingOut(
            id=b.id,
            resource_id=b.resource_id,
            resource_name=b.resource.name,
            booked_by=b.booked_by,
            booked_by_name=b.user.name,
            start_time=b.start_time,
            end_time=b.end_time,
            status=b.status,
            created_at=b.created_at
        ))
    return out

@router.post("", response_model=BookingOut)
async def make_booking(
    booking_in: BookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    booking = await create_booking(db, booking_in, current_user.id)
    
    # Reload for mapping
    res = await db.execute(
        select(Booking)
        .options(joinedload(Booking.resource), joinedload(Booking.user))
        .where(Booking.id == booking.id)
    )
    b = res.scalars().first()
    return BookingOut(
        id=b.id,
        resource_id=b.resource_id,
        resource_name=b.resource.name,
        booked_by=b.booked_by,
        booked_by_name=b.user.name,
        start_time=b.start_time,
        end_time=b.end_time,
        status=b.status,
        created_at=b.created_at
    )

@router.post("/{id}/cancel", response_model=BookingOut)
async def cancel_existing_booking(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify owner or manager
    booking_res = await db.execute(select(Booking).where(Booking.id == id))
    booking = booking_res.scalars().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
        
    if booking.booked_by != current_user.id and current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to cancel this booking."
        )
        
    b = await cancel_booking(db, id, current_user.id)
    
    # Reload
    res = await db.execute(
        select(Booking)
        .options(joinedload(Booking.resource), joinedload(Booking.user))
        .where(Booking.id == b.id)
    )
    rb = res.scalars().first()
    return BookingOut(
        id=rb.id,
        resource_id=rb.resource_id,
        resource_name=rb.resource.name,
        booked_by=rb.booked_by,
        booked_by_name=rb.user.name,
        start_time=rb.start_time,
        end_time=rb.end_time,
        status=rb.status,
        created_at=rb.created_at
    )

# --- DAILY SCHEDULE HEATMAP/VIEW ---

@router.get("/resources/{resource_id}/schedule", response_model=List[BookingOut])
async def resource_schedule(
    resource_id: int,
    date_str: str,  # format YYYY-MM-DD
    db: AsyncSession = Depends(get_db)
):
    try:
        query_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    # Calculate start and end datetime for that day
    start_dt = datetime.combine(query_date, time.min).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(query_date, time.max).replace(tzinfo=timezone.utc)

    # Find bookings overlapping that day
    query = select(Booking).options(
        joinedload(Booking.resource),
        joinedload(Booking.user)
    ).where(
        and_(
            Booking.resource_id == resource_id,
            Booking.status != BookingStatus.Cancelled,
            Booking.start_time < end_dt,
            Booking.end_time > start_dt
        )
    ).order_by(Booking.start_time.asc())

    res = await db.execute(query)
    bookings = res.scalars().all()

    out = []
    for b in bookings:
        out.append(BookingOut(
            id=b.id,
            resource_id=b.resource_id,
            resource_name=b.resource.name,
            booked_by=b.booked_by,
            booked_by_name=b.user.name,
            start_time=b.start_time,
            end_time=b.end_time,
            status=b.status,
            created_at=b.created_at
        ))
    return out
