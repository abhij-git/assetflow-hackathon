from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, AuditCycle, AuditItem, Asset, Department, VerificationStatus, AuditCycleStatus
from app.schemas.schemas import AuditCycleCreate, AuditCycleOut, AuditCycleDetailOut, AuditItemUpdate, AuditItemOut
from app.services.audit import create_audit_cycle, verify_audit_item, close_audit_cycle
import csv
import io
from typing import List, Optional

router = APIRouter()

# --- CYCLES ---

@router.get("/cycles", response_model=List[AuditCycleOut])
async def list_audit_cycles(db: AsyncSession = Depends(get_db)):
    query = select(AuditCycle).options(
        joinedload(AuditCycle.scope_department),
        joinedload(AuditCycle.auditors)
    ).order_by(AuditCycle.created_at.desc())
    
    res = await db.execute(query)
    cycles = res.scalars().unique().all()
    
    out = []
    for c in cycles:
        out.append(AuditCycleOut(
            id=c.id,
            scope_department_id=c.scope_department_id,
            scope_department_name=c.scope_department.name if c.scope_department else None,
            scope_location=c.scope_location,
            date_range_start=c.date_range_start,
            date_range_end=c.date_range_end,
            status=c.status,
            created_at=c.created_at,
            auditor_names=[aud.name for aud in c.auditors]
        ))
    return out

@router.post("/cycles", response_model=AuditCycleOut)
async def start_audit_cycle(
    cycle_in: AuditCycleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins or Asset Managers can start audit cycles."
        )
        
    cycle = await create_audit_cycle(db, cycle_in, current_user.id)
    
    # Reload for mapping
    res = await db.execute(
        select(AuditCycle)
        .options(joinedload(AuditCycle.scope_department), joinedload(AuditCycle.auditors))
        .where(AuditCycle.id == cycle.id)
    )
    c = res.scalars().first()
    return AuditCycleOut(
        id=c.id,
        scope_department_id=c.scope_department_id,
        scope_department_name=c.scope_department.name if c.scope_department else None,
        scope_location=c.scope_location,
        date_range_start=c.date_range_start,
        date_range_end=c.date_range_end,
        status=c.status,
        created_at=c.created_at,
        auditor_names=[aud.name for aud in c.auditors]
    )

@router.get("/cycles/{id}", response_model=AuditCycleDetailOut)
async def get_audit_cycle(id: int, db: AsyncSession = Depends(get_db)):
    cycle_res = await db.execute(
        select(AuditCycle)
        .options(joinedload(AuditCycle.scope_department), joinedload(AuditCycle.auditors))
        .where(AuditCycle.id == id)
    )
    c = cycle_res.scalars().unique().first()
    if not c:
        raise HTTPException(status_code=404, detail="Audit cycle not found")
        
    items_res = await db.execute(
        select(AuditItem)
        .options(joinedload(AuditItem.asset))
        .where(AuditItem.audit_cycle_id == id)
        .order_by(AuditItem.id.asc())
    )
    items = items_res.scalars().all()
    
    items_out = []
    for it in items:
        items_out.append(AuditItemOut(
            id=it.id,
            audit_cycle_id=it.audit_cycle_id,
            asset_id=it.asset_id,
            asset_tag=it.asset.tag,
            asset_name=it.asset.name,
            expected_location=it.expected_location,
            verification_status=it.verification_status,
            notes=it.notes,
            verified_at=it.verified_at
        ))
        
    return AuditCycleDetailOut(
        id=c.id,
        scope_department_id=c.scope_department_id,
        scope_department_name=c.scope_department.name if c.scope_department else None,
        scope_location=c.scope_location,
        date_range_start=c.date_range_start,
        date_range_end=c.date_range_end,
        status=c.status,
        created_at=c.created_at,
        auditor_names=[aud.name for aud in c.auditors],
        items=items_out
    )

@router.post("/cycles/{id}/close", response_model=AuditCycleOut)
async def close_cycle(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admins or Asset Managers can close audit cycles."
        )
        
    c = await close_audit_cycle(db, id, current_user.id)
    
    # Reload
    res = await db.execute(
        select(AuditCycle)
        .options(joinedload(AuditCycle.scope_department), joinedload(AuditCycle.auditors))
        .where(AuditCycle.id == c.id)
    )
    cl = res.scalars().unique().first()
    return AuditCycleOut(
        id=cl.id,
        scope_department_id=cl.scope_department_id,
        scope_department_name=cl.scope_department.name if cl.scope_department else None,
        scope_location=cl.scope_location,
        date_range_start=cl.date_range_start,
        date_range_end=cl.date_range_end,
        status=cl.status,
        created_at=cl.created_at,
        auditor_names=[aud.name for aud in cl.auditors]
    )

# --- ITEMS ---

@router.put("/items/{item_id}", response_model=AuditItemOut)
async def verify_item(
    item_id: int,
    update_in: AuditItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Retrieve item & cycle to check assigned auditor permissions
    item_res = await db.execute(
        select(AuditItem)
        .options(joinedload(AuditItem.asset))
        .where(AuditItem.id == item_id)
    )
    item = item_res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Audit item not found")
        
    cycle_res = await db.execute(
        select(AuditCycle)
        .options(joinedload(AuditCycle.auditors))
        .where(AuditCycle.id == item.audit_cycle_id)
    )
    cycle = cycle_res.scalars().first()
    
    # Enforce role logic: auditor, Admin, or AssetManager
    is_auditor = current_user.id in [aud.id for aud in cycle.auditors]
    if not is_auditor and current_user.role not in [UserRole.Admin, UserRole.AssetManager]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to verify items in this audit cycle."
        )
        
    it = await verify_audit_item(db, item_id, update_in, current_user.id)
    
    return AuditItemOut(
        id=it.id,
        audit_cycle_id=it.audit_cycle_id,
        asset_id=it.asset_id,
        asset_tag=it.asset.tag,
        asset_name=it.asset.name,
        expected_location=it.expected_location,
        verification_status=it.verification_status,
        notes=it.notes,
        verified_at=it.verified_at
    )

# --- DISCREPANCIES ---

@router.get("/cycles/{id}/discrepancies", response_model=List[AuditItemOut])
async def get_discrepancies(id: int, db: AsyncSession = Depends(get_db)):
    query = select(AuditItem).options(joinedload(AuditItem.asset)).where(
        and_(
            AuditItem.audit_cycle_id == id,
            AuditItem.verification_status.in_([VerificationStatus.Missing, VerificationStatus.Damaged])
        )
    )
    res = await db.execute(query)
    items = res.scalars().all()
    
    out = []
    for it in items:
        out.append(AuditItemOut(
            id=it.id,
            audit_cycle_id=it.audit_cycle_id,
            asset_id=it.asset_id,
            asset_tag=it.asset.tag,
            asset_name=it.asset.name,
            expected_location=it.expected_location,
            verification_status=it.verification_status,
            notes=it.notes,
            verified_at=it.verified_at
        ))
    return out

@router.get("/cycles/{id}/discrepancies/export")
async def export_discrepancies_csv(id: int, db: AsyncSession = Depends(get_db)):
    query = select(AuditItem).options(joinedload(AuditItem.asset)).where(
        and_(
            AuditItem.audit_cycle_id == id,
            AuditItem.verification_status.in_([VerificationStatus.Missing, VerificationStatus.Damaged])
        )
    )
    res = await db.execute(query)
    items = res.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow(["Item ID", "Asset Tag", "Asset Name", "Expected Location", "Status", "Notes", "Verified At"])
    
    for it in items:
        writer.writerow([
            it.id,
            it.asset.tag,
            it.asset.name,
            it.expected_location,
            it.verification_status,
            it.notes or "",
            it.verified_at.isoformat() if it.verified_at else ""
        ])
        
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_cycle_{id}_discrepancies.csv"}
    )
