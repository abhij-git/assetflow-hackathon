from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, MaintenanceRequest, Asset
from app.schemas.schemas import MaintenanceCreate, MaintenanceUpdate, MaintenanceOut
from app.services.maintenance import raise_maintenance_request, update_maintenance_status
from typing import List, Optional

router = APIRouter()

@router.get("", response_model=List[MaintenanceOut])
async def list_maintenance_requests(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    asset_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(MaintenanceRequest).options(
        joinedload(MaintenanceRequest.asset),
        joinedload(MaintenanceRequest.raiser),
        joinedload(MaintenanceRequest.approver)
    )
    filters = []

    if status:
        filters.append(MaintenanceRequest.status == status)
    if priority:
        filters.append(MaintenanceRequest.priority == priority)
    if asset_id:
        filters.append(MaintenanceRequest.asset_id == asset_id)

    # Employees can only see requests they raised
    if current_user.role == UserRole.Employee:
        filters.append(MaintenanceRequest.raised_by == current_user.id)
    elif current_user.role == UserRole.DeptHead:
        # Dept head can see requests raised by department members
        sub = select(User.id).where(User.department_id == current_user.department_id)
        filters.append(MaintenanceRequest.raised_by.in_(sub))

    if filters:
        query = query.where(and_(*filters))

    query = query.order_by(MaintenanceRequest.created_at.desc())
    res = await db.execute(query)
    requests = res.scalars().all()

    out = []
    for r in requests:
        out.append(MaintenanceOut(
            id=r.id,
            asset_id=r.asset_id,
            asset_tag=r.asset.tag,
            asset_name=r.asset.name,
            raised_by=r.raised_by,
            raised_by_name=r.raiser.name if r.raiser else None,
            issue_description=r.issue_description,
            priority=r.priority,
            photo_url=r.photo_url,
            status=r.status,
            technician_name=r.technician_name,
            approved_by=r.approved_by,
            approved_by_name=r.approver.name if r.approver else None,
            resolved_at=r.resolved_at,
            created_at=r.created_at
        ))
    return out

@router.post("", response_model=MaintenanceOut)
async def create_maintenance(
    mr_in: MaintenanceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    mr = await raise_maintenance_request(db, mr_in, current_user.id)

    # Reload
    res = await db.execute(
        select(MaintenanceRequest)
        .options(joinedload(MaintenanceRequest.asset), joinedload(MaintenanceRequest.raiser))
        .where(MaintenanceRequest.id == mr.id)
    )
    r = res.scalars().first()
    return MaintenanceOut(
        id=r.id,
        asset_id=r.asset_id,
        asset_tag=r.asset.tag,
        asset_name=r.asset.name,
        raised_by=r.raised_by,
        raised_by_name=r.raiser.name if r.raiser else None,
        issue_description=r.issue_description,
        priority=r.priority,
        photo_url=r.photo_url,
        status=r.status,
        technician_name=None,
        approved_by=None,
        approved_by_name=None,
        resolved_at=None,
        created_at=r.created_at
    )

@router.put("/{id}/status", response_model=MaintenanceOut)
async def update_status(
    id: int,
    update_in: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Only Admin or AssetManager can transition states
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins or Asset Managers can update maintenance request workflows."
        )

    mr = await update_maintenance_status(db, id, update_in, current_user.id)

    # Reload
    res = await db.execute(
        select(MaintenanceRequest)
        .options(joinedload(MaintenanceRequest.asset), joinedload(MaintenanceRequest.raiser), joinedload(MaintenanceRequest.approver))
        .where(MaintenanceRequest.id == mr.id)
    )
    r = res.scalars().first()
    return MaintenanceOut(
        id=r.id,
        asset_id=r.asset_id,
        asset_tag=r.asset.tag,
        asset_name=r.asset.name,
        raised_by=r.raised_by,
        raised_by_name=r.raiser.name if r.raiser else None,
        issue_description=r.issue_description,
        priority=r.priority,
        photo_url=r.photo_url,
        status=r.status,
        technician_name=r.technician_name,
        approved_by=r.approved_by,
        approved_by_name=r.approver.name if r.approver else None,
        resolved_at=r.resolved_at,
        created_at=r.created_at
    )
