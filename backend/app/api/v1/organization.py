from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import RoleChecker, get_current_user
from app.models.models import User, UserRole, Department, AssetCategory, UserStatus
from app.schemas.schemas import DepartmentCreate, DepartmentOut, CategoryCreate, CategoryOut, UserOut, UserRoleUpdate
from app.services.log_notification import create_activity_log
from typing import List

router = APIRouter()

# --- CATEGORIES ---

@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AssetCategory))
    return result.scalars().all()

@router.post("/categories", response_model=CategoryOut, dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def create_category(
    cat_in: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(select(AssetCategory).where(AssetCategory.name == cat_in.name))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Category name already exists")

    cat = AssetCategory(name=cat_in.name, custom_fields=cat_in.custom_fields)
    db.add(cat)
    await db.flush()

    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="CREATE_CATEGORY",
        entity_type="AssetCategory",
        entity_id=cat.id,
        details={"name": cat.name}
    )
    await db.commit()
    return cat

# --- DEPARTMENTS ---

@router.get("/departments", response_model=List[DepartmentOut])
async def list_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Department)
        .options(joinedload(Department.head), joinedload(Department.parent))
    )
    depts = result.scalars().all()
    out = []
    for d in depts:
        out.append(DepartmentOut(
            id=d.id,
            name=d.name,
            head_user_id=d.head_user_id,
            head_name=d.head.name if d.head else None,
            parent_department_id=d.parent_department_id,
            parent_name=d.parent.name if d.parent else None,
            status=d.status
        ))
    return out

@router.post("/departments", response_model=DepartmentOut, dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def create_department(
    dept_in: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await db.execute(select(Department).where(Department.name == dept_in.name))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="Department already exists")

    dept = Department(
        name=dept_in.name,
        head_user_id=dept_in.head_user_id,
        parent_department_id=dept_in.parent_department_id,
        status=dept_in.status
    )
    db.add(dept)
    await db.flush()

    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="CREATE_DEPARTMENT",
        entity_type="Department",
        entity_id=dept.id,
        details={"name": dept.name}
    )
    await db.commit()

    # Load complete relations for output
    result = await db.execute(
        select(Department)
        .options(joinedload(Department.head), joinedload(Department.parent))
        .where(Department.id == dept.id)
    )
    d = result.scalars().first()
    return DepartmentOut(
        id=d.id,
        name=d.name,
        head_user_id=d.head_user_id,
        head_name=d.head.name if d.head else None,
        parent_department_id=d.parent_department_id,
        parent_name=d.parent.name if d.parent else None,
        status=d.status
    )

@router.put("/departments/{id}", response_model=DepartmentOut, dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def update_department(
    id: int,
    dept_in: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dept_res = await db.execute(select(Department).where(Department.id == id))
    dept = dept_res.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    dept.name = dept_in.name
    dept.head_user_id = dept_in.head_user_id
    dept.parent_department_id = dept_in.parent_department_id
    dept.status = dept_in.status

    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="UPDATE_DEPARTMENT",
        entity_type="Department",
        entity_id=dept.id,
        details={"name": dept.name, "status": dept.status}
    )
    await db.commit()

    result = await db.execute(
        select(Department)
        .options(joinedload(Department.head), joinedload(Department.parent))
        .where(Department.id == id)
    )
    d = result.scalars().first()
    return DepartmentOut(
        id=d.id,
        name=d.name,
        head_user_id=d.head_user_id,
        head_name=d.head.name if d.head else None,
        parent_department_id=d.parent_department_id,
        parent_name=d.parent.name if d.parent else None,
        status=d.status
    )

# --- EMPLOYEE DIRECTORY ---

@router.get("/employees", response_model=List[UserOut], dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager, UserRole.DeptHead, UserRole.Employee]))])
async def list_employees(db: AsyncSession = Depends(get_db)):
    # Note: SQLite / Postgres ordering can differ, select ordering manually
    res = await db.execute(select(User).order_by(User.name))
    return res.scalars().all()

@router.put("/employees/{id}/role", response_model=UserOut, dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def promote_employee_role(
    id: int,
    role_update: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_res = await db.execute(select(User).where(User.id == id))
    user = user_res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    old_role = user.role
    user.role = role_update.role

    # Side effect: if role is changed, log activity
    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="PROMOTE_EMPLOYEE",
        entity_type="User",
        entity_id=user.id,
        details={"old_role": old_role, "new_role": user.role}
    )
    await db.commit()
    return user

@router.put("/employees/{id}/status", response_model=UserOut, dependencies=[Depends(RoleChecker([UserRole.Admin]))])
async def toggle_employee_status(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_res = await db.execute(select(User).where(User.id == id))
    user = user_res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Toggle Active <-> Inactive
    old_status = user.status
    user.status = UserStatus.Inactive if user.status == UserStatus.Active else UserStatus.Active

    await db.flush()
    await create_activity_log(
        db,
        actor_user_id=current_user.id,
        action="TOGGLE_EMPLOYEE_STATUS",
        entity_type="User",
        entity_id=user.id,
        details={"old_status": old_status, "new_status": user.status}
    )
    await db.commit()
    return user
