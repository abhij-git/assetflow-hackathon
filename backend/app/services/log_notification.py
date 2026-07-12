from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import Notification, ActivityLog

async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,
    message: str,
    related_entity_type: str = None,
    related_entity_id: int = None
):
    notification = Notification(
        user_id=user_id,
        type=type,
        message=message,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id
    )
    db.add(notification)
    await db.flush()
    return notification

async def create_activity_log(
    db: AsyncSession,
    actor_user_id: int,
    action: str,
    entity_type: str,
    entity_id: int = None,
    details: dict = None
):
    log = ActivityLog(
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {}
    )
    db.add(log)
    await db.flush()
    return log
