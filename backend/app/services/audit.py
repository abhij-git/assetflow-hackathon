from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, or_
from fastapi import HTTPException
from app.models.models import Asset, AuditCycle, AuditItem, User, UserRole, Department, AssetStatus, VerificationStatus, AuditCycleStatus, Allocation, AllocationStatus
from app.schemas.schemas import AuditCycleCreate, AuditItemUpdate
from app.services.log_notification import create_activity_log, create_notification
from datetime import datetime, timezone

async def create_audit_cycle(db: AsyncSession, cycle_in: AuditCycleCreate, actor_id: int) -> AuditCycle:
    # 1. Verify auditors exist
    auditors_query = await db.execute(select(User).where(User.id.in_(cycle_in.auditor_ids)))
    auditors = auditors_query.scalars().all()
    if len(auditors) != len(cycle_in.auditor_ids):
        raise HTTPException(status_code=400, detail="Some auditor user IDs do not exist")

    # 2. Create the cycle
    cycle = AuditCycle(
        scope_department_id=cycle_in.scope_department_id,
        scope_location=cycle_in.scope_location,
        date_range_start=cycle_in.date_range_start,
        date_range_end=cycle_in.date_range_end,
        status=AuditCycleStatus.Open,
        created_at=datetime.now(timezone.utc)
    )
    cycle.auditors = auditors
    db.add(cycle)
    await db.flush()

    # 3. Scope Assets
    # Find assets matching location or department allocation
    query = select(Asset)
    filters = []

    if cycle_in.scope_location:
        filters.append(Asset.location.ilike(f"%{cycle_in.scope_location}%"))

    if cycle_in.scope_department_id:
        # Fetch active allocations where holder is the department OR a user belonging to the department
        user_ids_subquery = select(User.id).where(User.department_id == cycle_in.scope_department_id)
        alloc_subquery = select(Allocation.asset_id).where(
            and_(
                Allocation.status == AllocationStatus.Active,
                or_(
                    Allocation.holder_department_id == cycle_in.scope_department_id,
                    Allocation.holder_user_id.in_(user_ids_subquery)
                )
            )
        )
        filters.append(Asset.id.in_(alloc_subquery))

    if filters:
        query = query.where(or_(*filters))

    assets_res = await db.execute(query)
    assets = assets_res.scalars().all()

    # 4. Generate AuditItems
    for asset in assets:
        item = AuditItem(
            audit_cycle_id=cycle.id,
            asset_id=asset.id,
            expected_location=asset.location,
            verification_status=VerificationStatus.Pending
        )
        db.add(item)

    # 5. Logs and Notifications
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="AUDIT_CYCLE_CREATE",
        entity_type="AuditCycle",
        entity_id=cycle.id,
        details={
            "scope_department_id": cycle_in.scope_department_id,
            "scope_location": cycle_in.scope_location,
            "assets_scoped": len(assets)
        }
    )

    for auditor in auditors:
        await create_notification(
            db,
            user_id=auditor.id,
            type="AuditAssigned",
            message=f"You have been assigned to Audit Cycle #{cycle.id}.",
            related_entity_type="AuditCycle",
            related_entity_id=cycle.id
        )

    await db.commit()
    return cycle

async def verify_audit_item(
    db: AsyncSession,
    item_id: int,
    update_in: AuditItemUpdate,
    actor_id: int
) -> AuditItem:
    # 1. Fetch item
    item_res = await db.execute(select(AuditItem).where(AuditItem.id == item_id))
    item = item_res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Audit item not found")

    # 2. Check if cycle is closed/locked
    cycle_res = await db.execute(select(AuditCycle).where(AuditCycle.id == item.audit_cycle_id))
    cycle = cycle_res.scalars().first()
    if cycle.status == AuditCycleStatus.Closed:
        raise HTTPException(status_code=400, detail="Cannot edit verification on a Closed audit cycle.")

    # 3. Update status
    item.verification_status = update_in.verification_status
    item.notes = update_in.notes
    item.verified_at = datetime.now(timezone.utc)

    # 4. Auto-flag discrepancies (if Missing or Damaged)
    if update_in.verification_status in [VerificationStatus.Missing, VerificationStatus.Damaged]:
        asset_res = await db.execute(select(Asset).where(Asset.id == item.asset_id))
        asset = asset_res.scalars().first()
        
        # Log discrepancy
        await create_activity_log(
            db,
            actor_user_id=actor_id,
            action="AUDIT_DISCREPANCY_FLAGGED",
            entity_type="AuditItem",
            entity_id=item.id,
            details={
                "asset_tag": asset.tag,
                "asset_name": asset.name,
                "status": update_in.verification_status
            }
        )

        # Notify admin and managers of discrepancy
        admin_managers_query = await db.execute(
            select(User).where(User.role.in_([UserRole.Admin, UserRole.AssetManager]))
        )
        for admin_manager in admin_managers_query.scalars().all():
            await create_notification(
                db,
                user_id=admin_manager.id,
                type="AuditDiscrepancy",
                message=f"Discrepancy flagged: Asset {asset.tag} verified as {update_in.verification_status}.",
                related_entity_type="AuditItem",
                related_entity_id=item.id
            )

    await db.commit()
    return item

async def close_audit_cycle(db: AsyncSession, cycle_id: int, actor_id: int) -> AuditCycle:
    # 1. Fetch cycle
    cycle_res = await db.execute(select(AuditCycle).where(AuditCycle.id == cycle_id))
    cycle = cycle_res.scalars().first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Audit cycle not found")

    if cycle.status == AuditCycleStatus.Closed:
        raise HTTPException(status_code=400, detail="Audit cycle is already closed")

    # 2. Lock cycle
    cycle.status = AuditCycleStatus.Closed

    # 3. Cascade missing items to Lost status
    items_res = await db.execute(select(AuditItem).where(AuditItem.audit_cycle_id == cycle_id))
    items = items_res.scalars().all()

    missing_asset_ids = [item.asset_id for item in items if item.verification_status == VerificationStatus.Missing]
    if missing_asset_ids:
        assets_res = await db.execute(select(Asset).where(Asset.id.in_(missing_asset_ids)))
        for asset in assets_res.scalars().all():
            asset.status = AssetStatus.Lost
            # Also log asset status change
            await create_activity_log(
                db,
                actor_user_id=actor_id,
                action="ASSET_LOST_BY_AUDIT",
                entity_type="Asset",
                entity_id=asset.id,
                details={"audit_cycle_id": cycle_id}
            )

    # 4. Activity logging
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="AUDIT_CYCLE_CLOSE",
        entity_type="AuditCycle",
        entity_id=cycle.id,
        details={"missing_assets_count": len(missing_asset_ids)}
    )

    await db.commit()
    return cycle
