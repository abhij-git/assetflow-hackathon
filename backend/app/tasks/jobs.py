import asyncio
from sqlalchemy.future import select
from sqlalchemy import and_
from app.tasks.celery import celery_app
from app.core.database import async_session_maker
from app.models.models import Allocation, AllocationStatus, Booking, BookingStatus, Notification, Asset, User
from datetime import datetime, timezone, timedelta

def run_async(coro):
    """Helper to run async coroutines in sync celery workers."""
    return asyncio.run(coro)

@celery_app.task
def check_overdue_allocations():
    """Celery task running daily to flag past-due allocations and notify users."""
    return run_async(_check_overdue_allocations())

@celery_app.task
def send_booking_reminders():
    """Celery task checking upcoming bookings starting soon and notifying users."""
    return run_async(_send_booking_reminders())

async def _check_overdue_allocations():
    now = datetime.now(timezone.utc)
    async with async_session_maker() as session:
        from sqlalchemy.orm import selectinload
        # Fetch active allocations that are past expected return date
        query = select(Allocation).options(selectinload(Allocation.asset)).where(
            and_(
                Allocation.status == AllocationStatus.Active,
                Allocation.expected_return_date < now
            )
        )
        
        res = await session.execute(query)
        allocations = res.scalars().all()
        
        count = 0
        for al in allocations:
            al.status = AllocationStatus.Overdue
            count += 1
            
            # Dispatch notification
            if al.holder_user_id:
                notif = Notification(
                    user_id=al.holder_user_id,
                    type="OverdueReturnAlert",
                    message=f"Reminder: Asset {al.asset.name} ({al.asset.tag}) was expected to be returned by {al.expected_return_date.strftime('%b %d, %Y')}. It is now marked as Overdue.",
                    related_entity_type="Asset",
                    related_entity_id=al.asset_id
                )
                session.add(notif)
                
        if count > 0:
            await session.commit()
            
        return f"Processed {count} overdue allocations."

async def _send_booking_reminders():
    now = datetime.now(timezone.utc)
    reminder_window = now + timedelta(minutes=30)
    
    async with async_session_maker() as session:
        from sqlalchemy.orm import selectinload
        # Query upcoming bookings starting within the next 30 minutes
        query = select(Booking).options(selectinload(Booking.resource)).where(
            and_(
                Booking.status == BookingStatus.Upcoming,
                Booking.start_time > now,
                Booking.start_time <= reminder_window
            )
        )
        res = await session.execute(query)
        bookings = res.scalars().all()
        
        count = 0
        for b in bookings:
            # Check if reminder has already been sent to prevent duplicates
            dup_query = select(Notification).where(
                and_(
                    Notification.user_id == b.booked_by,
                    Notification.type == "BookingReminder",
                    Notification.related_entity_id == b.id
                )
            )
            dup_res = await session.execute(dup_query)
            if dup_res.scalars().first():
                continue
                
            # Create notification
            notif = Notification(
                user_id=b.booked_by,
                type="BookingReminder",
                message=f"Upcoming Reservation: Your booking for '{b.resource.name}' starts shortly at {b.start_time.strftime('%H:%M')}.",
                related_entity_type="Booking",
                related_entity_id=b.id
            )
            session.add(notif)
            count += 1
            
        if count > 0:
            await session.commit()
            
        return f"Sent {count} booking reminders."
