from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, Allocation, TransferRequest, Asset, Department
from app.schemas.schemas import AllocationCreate, AllocationReturn, AllocationOut, TransferRequestCreate, TransferRequestOut
from app.services.allocation import allocate_asset, return_asset, create_transfer_request, approve_transfer_request, reject_transfer_request
from typing import List, Optional

router = APIRouter()

# --- ALLOCATIONS ---

@router.get("", response_model=List[AllocationOut])
async def list_allocations(
    status: Optional[str] = None,
    holder_user_id: Optional[int] = None,
    holder_department_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Allocation).options(
        joinedload(Allocation.asset),
        joinedload(Allocation.holder_user),
        joinedload(Allocation.holder_department)
    )
    filters = []
    
    if status:
        filters.append(Allocation.status == status)
    if holder_user_id:
        filters.append(Allocation.holder_user_id == holder_user_id)
    if holder_department_id:
        filters.append(Allocation.holder_department_id == holder_department_id)
        
    if filters:
        query = query.where(and_(*filters))
        
    query = query.order_by(Allocation.allocated_at.desc())
    res = await db.execute(query)
    allocs = res.scalars().all()
    
    out = []
    for al in allocs:
        out.append(AllocationOut(
            id=al.id,
            asset_id=al.asset_id,
            asset_tag=al.asset.tag,
            asset_name=al.asset.name,
            holder_user_id=al.holder_user_id,
            holder_user_name=al.holder_user.name if al.holder_user else None,
            holder_department_id=al.holder_department_id,
            holder_department_name=al.holder_department.name if al.holder_department else None,
            allocated_at=al.allocated_at,
            expected_return_date=al.expected_return_date,
            returned_at=al.returned_at,
            return_condition_notes=al.return_condition_notes,
            status=al.status
        ))
    return out

@router.post("", response_model=AllocationOut)
async def create_new_allocation(
    alloc_in: AllocationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only Admin or AssetManager can directly allocate
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins or Asset Managers can directly allocate assets."
        )
        
    alloc = await allocate_asset(db, alloc_in, current_user.id)
    
    # Reload for response mapping
    res = await db.execute(
        select(Allocation)
        .options(joinedload(Allocation.asset), joinedload(Allocation.holder_user), joinedload(Allocation.holder_department))
        .where(Allocation.id == alloc.id)
    )
    al = res.scalars().first()
    return AllocationOut(
        id=al.id,
        asset_id=al.asset_id,
        asset_tag=al.asset.tag,
        asset_name=al.asset.name,
        holder_user_id=al.holder_user_id,
        holder_user_name=al.holder_user.name if al.holder_user else None,
        holder_department_id=al.holder_department_id,
        holder_department_name=al.holder_department.name if al.holder_department else None,
        allocated_at=al.allocated_at,
        expected_return_date=al.expected_return_date,
        returned_at=al.returned_at,
        return_condition_notes=al.return_condition_notes,
        status=al.status
    )

@router.post("/{asset_id}/return", response_model=AllocationOut)
async def process_asset_return(
    asset_id: int,
    return_in: AllocationReturn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only Admin or AssetManager can process returns
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins or Asset Managers can process asset returns."
        )
        
    alloc = await return_asset(db, asset_id, return_in, current_user.id)
    
    # Reload for response mapping
    res = await db.execute(
        select(Allocation)
        .options(joinedload(Allocation.asset), joinedload(Allocation.holder_user), joinedload(Allocation.holder_department))
        .where(Allocation.id == alloc.id)
    )
    al = res.scalars().first()
    return AllocationOut(
        id=al.id,
        asset_id=al.asset_id,
        asset_tag=al.asset.tag,
        asset_name=al.asset.name,
        holder_user_id=al.holder_user_id,
        holder_user_name=al.holder_user.name if al.holder_user else None,
        holder_department_id=al.holder_department_id,
        holder_department_name=al.holder_department.name if al.holder_department else None,
        allocated_at=al.allocated_at,
        expected_return_date=al.expected_return_date,
        returned_at=al.returned_at,
        return_condition_notes=al.return_condition_notes,
        status=al.status
    )

# --- TRANSFERS ---

@router.get("/transfers/list", response_model=List[TransferRequestOut])
async def list_transfers(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(TransferRequest).options(
        joinedload(TransferRequest.asset),
        joinedload(TransferRequest.from_user),
        joinedload(TransferRequest.to_user),
        joinedload(TransferRequest.requester),
        joinedload(TransferRequest.approver)
    )
    
    # Employee can only see transfers they are involved in
    if current_user.role == UserRole.Employee:
        query = query.where(
            or_(
                TransferRequest.from_user_id == current_user.id,
                TransferRequest.to_user_id == current_user.id,
                TransferRequest.requested_by == current_user.id
            )
        )
    elif current_user.role == UserRole.DeptHead:
        # Dept Head can see transfer request from/to their department employees
        sub = select(User.id).where(User.department_id == current_user.department_id)
        query = query.where(
            or_(
                TransferRequest.from_user_id.in_(sub),
                TransferRequest.to_user_id.in_(sub)
            )
        )
        
    if status:
        query = query.where(TransferRequest.status == status)
        
    query = query.order_by(TransferRequest.created_at.desc())
    res = await db.execute(query)
    transfers = res.scalars().all()
    
    out = []
    for tr in transfers:
        out.append(TransferRequestOut(
            id=tr.id,
            asset_id=tr.asset_id,
            asset_tag=tr.asset.tag,
            asset_name=tr.asset.name,
            from_user_id=tr.from_user_id,
            from_user_name=tr.from_user.name,
            to_user_id=tr.to_user_id,
            to_user_name=tr.to_user.name,
            reason=tr.reason,
            status=tr.status,
            requested_by=tr.requested_by,
            requested_by_name=tr.requester.name,
            approved_by=tr.approved_by,
            approved_by_name=tr.approver.name if tr.approver else None,
            created_at=tr.created_at,
            updated_at=tr.updated_at
        ))
    return out

@router.post("/transfers", response_model=TransferRequestOut)
async def create_transfer(
    req_in: TransferRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tr = await create_transfer_request(db, req_in, current_user.id)
    
    # Reload for mapping
    res = await db.execute(
        select(TransferRequest)
        .options(
            joinedload(TransferRequest.asset),
            joinedload(TransferRequest.from_user),
            joinedload(TransferRequest.to_user),
            joinedload(TransferRequest.requester)
        )
        .where(TransferRequest.id == tr.id)
    )
    t = res.scalars().first()
    return TransferRequestOut(
        id=t.id,
        asset_id=t.asset_id,
        asset_tag=t.asset.tag,
        asset_name=t.asset.name,
        from_user_id=t.from_user_id,
        from_user_name=t.from_user.name,
        to_user_id=t.to_user_id,
        to_user_name=t.to_user.name,
        reason=t.reason,
        status=t.status,
        requested_by=t.requested_by,
        requested_by_name=t.requester.name,
        approved_by=None,
        approved_by_name=None,
        created_at=t.created_at,
        updated_at=t.updated_at
    )

@router.post("/transfers/{id}/approve", response_model=TransferRequestOut)
async def approve_transfer(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Enforce role logic: Admin, AssetManager, or DeptHead of the target employee
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager, UserRole.DeptHead]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to approve transfer requests."
        )
        
    tr_res = await db.execute(select(TransferRequest).where(TransferRequest.id == id))
    transfer = tr_res.scalars().first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found")
        
    if current_user.role == UserRole.DeptHead:
        # Verify recipient user belongs to Department Head's department
        rec_res = await db.execute(select(User).where(User.id == transfer.to_user_id))
        recipient = rec_res.scalars().first()
        if not recipient or recipient.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only approve transfers destined for employees within their department."
            )
            
    tr = await approve_transfer_request(db, id, current_user.id)
    
    # Reload for mapping
    res = await db.execute(
        select(TransferRequest)
        .options(
            joinedload(TransferRequest.asset),
            joinedload(TransferRequest.from_user),
            joinedload(TransferRequest.to_user),
            joinedload(TransferRequest.requester),
            joinedload(TransferRequest.approver)
        )
        .where(TransferRequest.id == tr.id)
    )
    t = res.scalars().first()
    return TransferRequestOut(
        id=t.id,
        asset_id=t.asset_id,
        asset_tag=t.asset.tag,
        asset_name=t.asset.name,
        from_user_id=t.from_user_id,
        from_user_name=t.from_user.name,
        to_user_id=t.to_user_id,
        to_user_name=t.to_user.name,
        reason=t.reason,
        status=t.status,
        requested_by=t.requested_by,
        requested_by_name=t.requester.name,
        approved_by=t.approved_by,
        approved_by_name=t.approver.name if t.approver else None,
        created_at=t.created_at,
        updated_at=t.updated_at
    )

@router.post("/transfers/{id}/reject", response_model=TransferRequestOut)
async def reject_transfer(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Enforce role logic: Admin, AssetManager, or DeptHead of the target employee
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager, UserRole.DeptHead]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to reject transfer requests."
        )
        
    tr_res = await db.execute(select(TransferRequest).where(TransferRequest.id == id))
    transfer = tr_res.scalars().first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer request not found")
        
    if current_user.role == UserRole.DeptHead:
        rec_res = await db.execute(select(User).where(User.id == transfer.to_user_id))
        recipient = rec_res.scalars().first()
        if not recipient or recipient.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Department Heads can only reject transfers destined for employees within their department."
            )

    tr = await reject_transfer_request(db, id, current_user.id)
    
    # Reload for mapping
    res = await db.execute(
        select(TransferRequest)
        .options(
            joinedload(TransferRequest.asset),
            joinedload(TransferRequest.from_user),
            joinedload(TransferRequest.to_user),
            joinedload(TransferRequest.requester),
            joinedload(TransferRequest.approver)
        )
        .where(TransferRequest.id == tr.id)
    )
    t = res.scalars().first()
    return TransferRequestOut(
        id=t.id,
        asset_id=t.asset_id,
        asset_tag=t.asset.tag,
        asset_name=t.asset.name,
        from_user_id=t.from_user_id,
        from_user_name=t.from_user.name,
        to_user_id=t.to_user_id,
        to_user_name=t.to_user.name,
        reason=t.reason,
        status=t.status,
        requested_by=t.requested_by,
        requested_by_name=t.requester.name,
        approved_by=t.approved_by,
        approved_by_name=t.approver.name if t.approver else None,
        created_at=t.created_at,
        updated_at=t.updated_at
    )
