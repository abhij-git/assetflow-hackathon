from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, update
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, Notification, ActivityLog
from app.schemas.schemas import NotificationOut, ActivityLogOut
from typing import List, Optional

router = APIRouter()

# --- USER NOTIFICATIONS ---

@router.get("/notifications", response_model=List[NotificationOut])
async def list_notifications(
    unread_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        query = query.where(Notification.is_read == False)
    
    query = query.order_by(Notification.created_at.desc())
    res = await db.execute(query)
    return res.scalars().all()

@router.put("/notifications/{id}/read", response_model=NotificationOut)
async def mark_notification_read(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify notification belongs to user
    res = await db.execute(select(Notification).where(Notification.id == id))
    notification = res.scalars().first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if notification.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    notification.is_read = True
    await db.commit()
    return notification

@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await db.execute(
        update(Notification)
        .where(and_(Notification.user_id == current_user.id, Notification.is_read == False))
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read."}

# --- SYSTEM ACTIVITY LOGS (ADMIN ONLY) ---

@router.get("/activity-logs", response_model=List[ActivityLogOut], dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def list_activity_logs(
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    query = select(ActivityLog).options(joinedload(ActivityLog.actor)).order_by(ActivityLog.created_at.desc()).limit(limit)
    res = await db.execute(query)
    logs = res.scalars().all()
    
    out = []
    for log in logs:
        out.append(ActivityLogOut(
            id=log.id,
            actor_user_id=log.actor_user_id,
            actor_user_name=log.actor.name if log.actor else "System/Seeder",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            created_at=log.created_at
        ))
    return out
