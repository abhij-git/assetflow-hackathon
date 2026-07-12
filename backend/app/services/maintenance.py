from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from fastapi import HTTPException
from app.models.models import Asset, MaintenanceRequest, MaintenanceStatus, AssetStatus, AllocationStatus
from app.schemas.schemas import MaintenanceCreate, MaintenanceUpdate
from app.services.allocation import get_active_allocation
from app.services.log_notification import create_activity_log, create_notification
from datetime import datetime, timezone

# Draggable adjacent transitions validation
VALID_TRANSITIONS = {
    MaintenanceStatus.Pending: [MaintenanceStatus.Approved, MaintenanceStatus.Rejected],
    MaintenanceStatus.Approved: [MaintenanceStatus.TechnicianAssigned],
    MaintenanceStatus.Rejected: [],
    MaintenanceStatus.TechnicianAssigned: [MaintenanceStatus.InProgress],
    MaintenanceStatus.InProgress: [MaintenanceStatus.Resolved],
    MaintenanceStatus.Resolved: []
}

async def raise_maintenance_request(db: AsyncSession, mr_in: MaintenanceCreate, actor_id: int) -> MaintenanceRequest:
    # 1. Verify asset
    asset_res = await db.execute(select(Asset).where(Asset.id == mr_in.asset_id))
    asset = asset_res.scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 2. Create request
    request = MaintenanceRequest(
        asset_id=mr_in.asset_id,
        raised_by=actor_id,
        issue_description=mr_in.issue_description,
        priority=mr_in.priority,
        photo_url=mr_in.photo_url,
        status=MaintenanceStatus.Pending,
        created_at=datetime.now(timezone.utc)
    )
    db.add(request)
    await db.flush()

    # Log and notify
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="MAINTENANCE_RAISE",
        entity_type="MaintenanceRequest",
        entity_id=request.id,
        details={"asset_id": mr_in.asset_id, "priority": mr_in.priority}
    )

    await db.commit()
    return request

async def update_maintenance_status(
    db: AsyncSession,
    request_id: int,
    update_in: MaintenanceUpdate,
    actor_id: int
) -> MaintenanceRequest:
    # 1. Fetch request and asset
    mr_res = await db.execute(select(MaintenanceRequest).where(MaintenanceRequest.id == request_id))
    request = mr_res.scalars().first()
    if not request:
        raise HTTPException(status_code=404, detail="Maintenance request not found")

    asset_res = await db.execute(select(Asset).where(Asset.id == request.asset_id))
    asset = asset_res.scalars().first()

    current_status = request.status
    new_status = update_in.status

    # 2. Enforce adjacent transition check
    allowed = VALID_TRANSITIONS.get(current_status, [])
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transition from {current_status} to {new_status}. Allowed transitions: {', '.join(allowed) or 'None'}"
        )

    # 3. Perform transition and trigger asset side-effects
    request.status = new_status
    if update_in.technician_name:
        request.technician_name = update_in.technician_name

    if new_status == MaintenanceStatus.Approved:
        request.approved_by = actor_id
        # Side effect: Set asset status to UnderMaintenance
        asset.status = AssetStatus.UnderMaintenance
        
        # Data integrity side effect: close active allocation as Returned
        active_alloc = await get_active_allocation(db, asset.id)
        if active_alloc:
            active_alloc.returned_at = datetime.now(timezone.utc)
            active_alloc.return_condition_notes = "Sent to maintenance approval workflow."
            active_alloc.status = AllocationStatus.Returned

    elif new_status == MaintenanceStatus.Resolved:
        request.resolved_at = datetime.now(timezone.utc)
        # Side effect: Set asset status back to Available
        asset.status = AssetStatus.Available

    # 4. Logs and notifications
    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action=f"MAINTENANCE_{new_status.upper()}",
        entity_type="MaintenanceRequest",
        entity_id=request.id,
        details={"previous_status": current_status, "new_status": new_status}
    )

    # Notify raiser
    await create_notification(
        db,
        user_id=request.raised_by,
        type="MaintenanceUpdate",
        message=f"Maintenance request for Asset {asset.tag} has been updated to {new_status}.",
        related_entity_type="MaintenanceRequest",
        related_entity_id=request.id
    )

    await db.commit()
    return request
