from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, Asset, AssetCategory, AssetStatus, Allocation, MaintenanceRequest, BookableResource, Department
from app.schemas.schemas import AssetCreate, AssetOut, AssetDetailOut, AllocationOut, MaintenanceOut
from app.services.s3 import s3_service
from app.services.log_notification import create_activity_log
from typing import List, Optional
import uuid

router = APIRouter()

# --- FILE UPLOAD ---
@router.post("/upload")
async def upload_asset_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        content = await file.read()
        # Generate unique filename to avoid collision
        ext = file.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{ext}"
        
        file_url = s3_service.upload_file(
            file_content=content,
            file_name=unique_filename,
            content_type=file.content_type
        )
        return {"url": file_url}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )

# --- ASSET RESOURCE MANAGEMENT ---
@router.get("", response_model=List[AssetOut])
async def list_assets(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    location: Optional[str] = None,
    department_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Asset).options(joinedload(Asset.category))
    filters = []

    if search:
        search_filter = or_(
            Asset.tag.ilike(f"%{search}%"),
            Asset.name.ilike(f"%{search}%"),
            Asset.serial_number.ilike(f"%{search}%"),
            Asset.location.ilike(f"%{search}%")
        )
        filters.append(search_filter)

    if category_id:
        filters.append(Asset.category_id == category_id)

    if status:
        filters.append(Asset.status == status)

    if location:
        filters.append(Asset.location.ilike(f"%{location}%"))

    if department_id:
        # Filter by assets currently allocated to this department or employees in this department
        user_ids_subquery = select(User.id).where(User.department_id == department_id)
        active_alloc_subquery = select(Allocation.asset_id).where(
            and_(
                Allocation.status == "Active",
                or_(
                    Allocation.holder_department_id == department_id,
                    Allocation.holder_user_id.in_(user_ids_subquery)
                )
            )
        )
        filters.append(Asset.id.in_(active_alloc_subquery))

    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    assets = result.scalars().all()
    
    out = []
    for a in assets:
        out.append(AssetOut(
            id=a.id,
            tag=a.tag,
            name=a.name,
            category_id=a.category_id,
            category_name=a.category.name,
            serial_number=a.serial_number,
            acquisition_date=a.acquisition_date,
            acquisition_cost=float(a.acquisition_cost),
            condition=a.condition,
            location=a.location,
            is_bookable=a.is_bookable,
            status=a.status,
            photo_url=a.photo_url,
            document_urls=a.document_urls or [],
            created_at=a.created_at
        ))
    return out

@router.post("", response_model=AssetOut, dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def register_asset(
    asset_in: AssetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 1. Verify category exists
    cat_res = await db.execute(select(AssetCategory).where(AssetCategory.id == asset_in.category_id))
    category = cat_res.scalars().first()
    if not category:
        raise HTTPException(status_code=400, detail="Asset category not found")

    # 2. Sequential unique tag generation
    # Get last tag id
    last_res = await db.execute(select(Asset.tag).order_by(Asset.id.desc()).limit(1))
    last_tag = last_res.scalars().first()
    next_num = 1
    if last_tag and last_tag.startswith("AF-"):
        try:
            next_num = int(last_tag.split("-")[1]) + 1
        except ValueError:
            pass
    tag = f"AF-{next_num:04d}"

    # 3. Create asset
    asset = Asset(
        tag=tag,
        name=asset_in.name,
        category_id=asset_in.category_id,
        serial_number=asset_in.serial_number,
        acquisition_date=asset_in.acquisition_date,
        acquisition_cost=asset_in.acquisition_cost,
        condition=asset_in.condition.value if hasattr(asset_in.condition, "value") else asset_in.condition,
        location=asset_in.location,
        is_bookable=asset_in.is_bookable,
        status=AssetStatus.Available,
        photo_url=asset_in.photo_url,
        document_urls=asset_in.document_urls
    )
    db.add(asset)
    await db.flush()

    # 4. If asset is bookable, automatically link it to BookableResource
    if asset.is_bookable:
        res = BookableResource(
            asset_id=asset.id,
            name=asset.name,
            description=f"Bookable asset: {asset.name} ({asset.tag})"
        )
        db.add(res)

    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="REGISTER_ASSET",
        entity_type="Asset",
        entity_id=asset.id,
        details={"tag": asset.tag, "name": asset.name}
    )
    await db.commit()

    return AssetOut(
        id=asset.id,
        tag=asset.tag,
        name=asset.name,
        category_id=asset.category_id,
        category_name=category.name,
        serial_number=asset.serial_number,
        acquisition_date=asset.acquisition_date,
        acquisition_cost=float(asset.acquisition_cost),
        condition=asset.condition,
        location=asset.location,
        is_bookable=asset.is_bookable,
        status=asset.status,
        photo_url=asset.photo_url,
        document_urls=asset.document_urls or [],
        created_at=asset.created_at
    )

@router.get("/{id}", response_model=AssetDetailOut)
async def get_asset_detail(id: int, db: AsyncSession = Depends(get_db)):
    # 1. Fetch asset
    asset_res = await db.execute(
        select(Asset)
        .options(joinedload(Asset.category))
        .where(Asset.id == id)
    )
    a = asset_res.scalars().first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")

    # 2. Fetch allocation history
    alloc_res = await db.execute(
        select(Allocation)
        .options(joinedload(Allocation.holder_user), joinedload(Allocation.holder_department))
        .where(Allocation.asset_id == id)
        .order_by(Allocation.allocated_at.desc())
    )
    allocations = alloc_res.scalars().all()

    # 3. Fetch maintenance history
    maint_res = await db.execute(
        select(MaintenanceRequest)
        .options(joinedload(MaintenanceRequest.raiser), joinedload(MaintenanceRequest.approver))
        .where(MaintenanceRequest.asset_id == id)
        .order_by(MaintenanceRequest.created_at.desc())
    )
    maintenances = maint_res.scalars().all()

    asset_out = AssetOut(
        id=a.id,
        tag=a.tag,
        name=a.name,
        category_id=a.category_id,
        category_name=a.category.name,
        serial_number=a.serial_number,
        acquisition_date=a.acquisition_date,
        acquisition_cost=float(a.acquisition_cost),
        condition=a.condition,
        location=a.location,
        is_bookable=a.is_bookable,
        status=a.status,
        photo_url=a.photo_url,
        document_urls=a.document_urls or [],
        created_at=a.created_at
    )

    alloc_list = []
    for al in allocations:
        alloc_list.append(AllocationOut(
            id=al.id,
            asset_id=al.asset_id,
            asset_tag=a.tag,
            asset_name=a.name,
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

    maint_list = []
    for m in maintenances:
        maint_list.append(MaintenanceOut(
            id=m.id,
            asset_id=m.asset_id,
            asset_tag=a.tag,
            asset_name=a.name,
            raised_by=m.raised_by,
            raised_by_name=m.raiser.name if m.raiser else None,
            issue_description=m.issue_description,
            priority=m.priority,
            photo_url=m.photo_url,
            status=m.status,
            technician_name=m.technician_name,
            approved_by=m.approved_by,
            approved_by_name=m.approver.name if m.approver else None,
            resolved_at=m.resolved_at,
            created_at=m.created_at
        ))

    return AssetDetailOut(
        asset=asset_out,
        allocation_history=alloc_list,
        maintenance_history=maint_list
    )
