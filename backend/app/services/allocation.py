from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from fastapi import HTTPException, status
from app.models.models import Asset, Allocation, TransferRequest, AssetStatus, AllocationStatus, TransferRequestStatus, User, Department
from app.schemas.schemas import AllocationCreate, AllocationReturn, TransferRequestCreate
from app.services.log_notification import create_activity_log, create_notification
from datetime import datetime, timezone

async def get_active_allocation(db: AsyncSession, asset_id: int) -> Allocation:
    result = await db.execute(
        select(Allocation).where(
            and_(
                Allocation.asset_id == asset_id,
                Allocation.status == AllocationStatus.Active
            )
        )
    )
    return result.scalars().first()

async def allocate_asset(db: AsyncSession, alloc_in: AllocationCreate, actor_id: int) -> Allocation:
    # 1. Fetch asset
    asset_result = await db.execute(select(Asset).where(Asset.id == alloc_in.asset_id))
    asset = asset_result.scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 2. Hard double-allocation block
    if asset.status != AssetStatus.Available:
        active_alloc = await get_active_allocation(db, asset.id)
        holder_name = "System"
        dept_name = "N/A"
        
        if active_alloc:
            if active_alloc.holder_user_id:
                user_res = await db.execute(select(User).where(User.id == active_alloc.holder_user_id))
                u = user_res.scalars().first()
                if u:
                    holder_name = u.name
                    if u.department_id:
                        dept_res = await db.execute(select(Department).where(Department.id == u.department_id))
                        d = dept_res.scalars().first()
                        if d:
                            dept_name = d.name
            elif active_alloc.holder_department_id:
                dept_res = await db.execute(select(Department).where(Department.id == active_alloc.holder_department_id))
                d = dept_res.scalars().first()
                if d:
                    holder_name = f"Department: {d.name}"
                    dept_name = d.name
        
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Asset {asset.tag} is not available for direct allocation. Current status: {asset.status}.",
                "holder_name": holder_name,
                "department_name": dept_name,
                "status": asset.status
            }
        )

    # 3. Create allocation
    new_alloc = Allocation(
        asset_id=asset.id,
        holder_user_id=alloc_in.holder_user_id,
        holder_department_id=alloc_in.holder_department_id,
        allocated_at=datetime.now(timezone.utc),
        expected_return_date=alloc_in.expected_return_date,
        status=AllocationStatus.Active
    )
    db.add(new_alloc)
    
    # 4. Update asset status
    asset.status = AssetStatus.Allocated
    
    # 5. Activity log & notifications
    await db.flush()
    
    # Log activity
    details = {"expected_return_date": alloc_in.expected_return_date.isoformat() if alloc_in.expected_return_date else None}
    if alloc_in.holder_user_id:
        details["holder_type"] = "user"
        details["holder_id"] = alloc_in.holder_user_id
        # Notify user
        await create_notification(
            db, 
            user_id=alloc_in.holder_user_id, 
            type="AssetAssigned", 
            message=f"Asset {asset.name} ({asset.tag}) has been allocated to you.",
            related_entity_type="Asset",
            related_entity_id=asset.id
        )
    else:
        details["holder_type"] = "department"
        details["holder_id"] = alloc_in.holder_department_id
        if alloc_in.holder_department_id:
            dept_res = await db.execute(select(Department).where(Department.id == alloc_in.holder_department_id))
            dept = dept_res.scalars().first()
            if dept and dept.head_user_id:
                await create_notification(
                    db,
                    user_id=dept.head_user_id,
                    type="AssetAssigned",
                    message=f"Asset {asset.name} ({asset.tag}) has been allocated to your department ({dept.name}).",
                    related_entity_type="Asset",
                    related_entity_id=asset.id
                )
        
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="ALLOCATE",
        entity_type="Asset",
        entity_id=asset.id,
        details=details
    )
    
    await db.commit()
    return new_alloc

async def return_asset(db: AsyncSession, asset_id: int, return_in: AllocationReturn, actor_id: int) -> Allocation:
    # 1. Fetch asset
    asset_result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = asset_result.scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 2. Get active allocation
    active_alloc = await get_active_allocation(db, asset_id)
    if not active_alloc:
        raise HTTPException(status_code=400, detail="No active allocation found for this asset")

    # 3. Close allocation
    active_alloc.returned_at = datetime.now(timezone.utc)
    active_alloc.return_condition_notes = return_in.return_condition_notes
    active_alloc.status = AllocationStatus.Returned

    # 4. Update asset
    asset.status = AssetStatus.Available
    
    # Optional: Update asset condition if returned condition is recorded
    # (Just log it in return notes, or we can keep asset condition as is)

    # 5. Logging and notifications
    await db.flush()
    
    await create_activity_log(
        db,
        actor_user_id=actor_id,
        action="RETURN",
        entity_type="Asset",
        entity_id=asset.id,
        details={"return_condition_notes": return_in.return_condition_notes}
    )
    
    if active_alloc.holder_user_id:
        await create_notification(
            db,
            user_id=active_alloc.holder_user_id,
            type="AssetReturned",
            message=f"Return of Asset {asset.tag} has been processed and approved.",
            related_entity_type="Asset",
            related_entity_id=asset.id
        )
        
    await db.commit()
    return active_alloc

async def create_transfer_request(db: AsyncSession, req_in: TransferRequestCreate, requester_id: int) -> TransferRequest:
    # 1. Fetch asset
    asset_res = await db.execute(select(Asset).where(Asset.id == req_in.asset_id))
    asset = asset_res.scalars().first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 2. Get active allocation (must be currently allocated to create a transfer)
    active_alloc = await get_active_allocation(db, req_in.asset_id)
    if not active_alloc or not active_alloc.holder_user_id:
        raise HTTPException(status_code=400, detail="Asset is not currently allocated to a user; direct allocation can be performed instead.")

    # 3. Create transfer request
    transfer = TransferRequest(
        asset_id=req_in.asset_id,
        from_user_id=active_alloc.holder_user_id,
        to_user_id=req_in.to_user_id,
        reason=req_in.reason,
        status=TransferRequestStatus.Requested,
        requested_by=requester_id
    )
    db.add(transfer)
    await db.flush()

    # Log and notify
    await create_activity_log(
        db,
        actor_user_id=requester_id,
        action="TRANSFER_REQUEST",
        entity_type="TransferRequest",
        entity_id=transfer.id,
        details={"from_user_id": active_alloc.holder_user_id, "to_user_id": req_in.to_user_id}
    )
    
    # Notify target user
    await create_notification(
        db,
        user_id=req_in.to_user_id,
        type="TransferRequested",
        message=f"A transfer request has been submitted to assign Asset {asset.tag} to you.",
        related_entity_type="TransferRequest",
        related_entity_id=transfer.id
    )
    
    await db.commit()
    return transfer

async def approve_transfer_request(db: AsyncSession, transfer_id: int, approver_id: int) -> TransferRequest:
    # 1. Fetch request
    tr_res = await db.execute(select(TransferRequest).where(TransferRequest.id == transfer_id))
    transfer = tr_res.scalars().first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found")

    if transfer.status != TransferRequestStatus.Requested:
        raise HTTPException(status_code=400, detail="Transfer request is not in Requested status")

    # 2. Fetch asset and active allocation
    asset_res = await db.execute(select(Asset).where(Asset.id == transfer.asset_id))
    asset = asset_res.scalars().first()
    
    active_alloc = await get_active_allocation(db, transfer.asset_id)
    if active_alloc:
        # Close old allocation
        active_alloc.returned_at = datetime.now(timezone.utc)
        active_alloc.return_condition_notes = f"Transferred to User ID {transfer.to_user_id}"
        active_alloc.status = AllocationStatus.Returned

    # 3. Create new allocation
    new_alloc = Allocation(
        asset_id=transfer.asset_id,
        holder_user_id=transfer.to_user_id,
        allocated_at=datetime.now(timezone.utc),
        status=AllocationStatus.Active
    )
    db.add(new_alloc)

    # 4. Update request status
    transfer.status = TransferRequestStatus.Approved
    transfer.approved_by = approver_id

    # 5. Log and notify
    await db.flush()
    
    await create_activity_log(
        db,
        actor_user_id=approver_id,
        action="TRANSFER_APPROVE",
        entity_type="TransferRequest",
        entity_id=transfer.id,
        details={"from_user_id": transfer.from_user_id, "to_user_id": transfer.to_user_id}
    )

    # Notify users
    await create_notification(
        db,
        user_id=transfer.to_user_id,
        type="TransferApproved",
        message=f"Transfer request approved. Asset {asset.tag} has been allocated to you.",
        related_entity_type="Asset",
        related_entity_id=asset.id
    )
    await create_notification(
        db,
        user_id=transfer.from_user_id,
        type="TransferApproved",
        message=f"Transfer of Asset {asset.tag} to another holder has been approved.",
        related_entity_type="Asset",
        related_entity_id=asset.id
    )

    await db.commit()
    return transfer

async def reject_transfer_request(db: AsyncSession, transfer_id: int, rejecter_id: int) -> TransferRequest:
    tr_res = await db.execute(select(TransferRequest).where(TransferRequest.id == transfer_id))
    transfer = tr_res.scalars().first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found")

    if transfer.status != TransferRequestStatus.Requested:
        raise HTTPException(status_code=400, detail="Transfer request is not in Requested status")

    transfer.status = TransferRequestStatus.Rejected
    transfer.approved_by = rejecter_id

    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=rejecter_id,
        action="TRANSFER_REJECT",
        entity_type="TransferRequest",
        entity_id=transfer.id,
        details={}
    )
    
    await create_notification(
        db,
        user_id=transfer.requested_by,
        type="TransferRejected",
        message=f"Your transfer request for Asset ID {transfer.asset_id} has been rejected.",
        related_entity_type="TransferRequest",
        related_entity_id=transfer.id
    )

    await db.commit()
    return transfer
