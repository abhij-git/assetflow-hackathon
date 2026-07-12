from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    imports=["app.tasks.jobs"]
)

# Configure Celery Beat schedules
celery_app.conf.beat_schedule = {
    # Check for allocations past expected return date daily at midnight
    "check-overdue-allocations-daily": {
        "task": "app.tasks.jobs.check_overdue_allocations",
        "schedule": crontab(hour=0, minute=0),
    },
    # Send booking reminder notifications every 10 minutes
    "send-booking-reminders-every-10m": {
        "task": "app.tasks.jobs.send_booking_reminders",
        "schedule": crontab(minute="*/10"),
    }
}
