from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, or_, func, desc
from sqlalchemy.orm import joinedload
from app.core.database import get_db
from app.core.deps import get_current_user, RoleChecker
from app.models.models import User, UserRole, Asset, AssetStatus, Allocation, AllocationStatus, MaintenanceRequest, MaintenanceStatus, Booking, BookingStatus, Department, AssetCategory, ActivityLog
from app.schemas.schemas import DashboardStats, ActivityLogOut
from datetime import datetime, timezone, timedelta, date
import csv
import io
from typing import List, Dict, Any

router = APIRouter()

# --- DASHBOARD STATS (ROLE AWARE) ---

@router.get("/dashboard-stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.now(timezone.utc)
    
    # Base queries
    asset_query = select(func.count(Asset.id))
    alloc_query = select(func.count(Allocation.id)).where(Allocation.status == AllocationStatus.Active)
    maint_query = select(func.count(MaintenanceRequest.id)).where(MaintenanceRequest.status != MaintenanceStatus.Resolved)
    booking_query = select(func.count(Booking.id)).where(Booking.status.in_([BookingStatus.Upcoming, BookingStatus.Ongoing]))
    transfer_query = select(func.count(TransferRequest.id)).where(TransferRequest.status == "Requested") if 'TransferRequest' in globals() else select(func.count(Asset.id)).where(Asset.status == "Retired") # Safe fallback if not imported
    
    # Let's import TransferRequest locally to avoid import loops
    from app.models.models import TransferRequest
    transfer_query = select(func.count(TransferRequest.id)).where(TransferRequest.status == "Requested")

    # Dynamic scoping filters based on role
    if current_user.role == UserRole.Employee:
        # Personal Scope
        # Allocated assets to the user
        alloc_query = alloc_query.where(Allocation.holder_user_id == current_user.id)
        # Maintenance raised by the user
        maint_query = maint_query.where(MaintenanceRequest.raised_by == current_user.id)
        # Bookings made by the user
        booking_query = booking_query.where(Booking.booked_by == current_user.id)
        # Transfers involved in
        transfer_query = transfer_query.where(
            or_(
                TransferRequest.from_user_id == current_user.id,
                TransferRequest.to_user_id == current_user.id,
                TransferRequest.requested_by == current_user.id
            )
        )
    elif current_user.role == UserRole.DeptHead:
        # Department Scope
        dept_id = current_user.department_id
        # Employees in department
        dept_user_ids = select(User.id).where(User.department_id == dept_id)
        
        alloc_query = alloc_query.where(
            or_(
                Allocation.holder_department_id == dept_id,
                Allocation.holder_user_id.in_(dept_user_ids)
            )
        )
        maint_query = maint_query.where(MaintenanceRequest.raised_by.in_(dept_user_ids))
        booking_query = booking_query.where(Booking.booked_by.in_(dept_user_ids))
        transfer_query = transfer_query.where(
            or_(
                TransferRequest.from_user_id.in_(dept_user_ids),
                TransferRequest.to_user_id.in_(dept_user_ids)
            )
        )

    # Execute aggregate counts
    avail_count_res = await db.execute(asset_query.where(Asset.status == AssetStatus.Available))
    assets_avail = avail_count_res.scalar() or 0

    alloc_count_res = await db.execute(asset_query.where(Asset.status == AssetStatus.Allocated))
    assets_allocated = alloc_count_res.scalar() or 0

    # Maintenance
    maint_count_res = await db.execute(maint_query)
    maintenance_active = maint_count_res.scalar() or 0

    # Bookings
    booking_count_res = await db.execute(booking_query)
    active_bookings = booking_count_res.scalar() or 0

    # Transfers
    transfer_count_res = await db.execute(transfer_query)
    pending_transfers = transfer_count_res.scalar() or 0

    # Upcoming returns (expected_return_date within next 7 days, returned_at is null)
    upcoming_query = select(func.count(Allocation.id)).where(
        and_(
            Allocation.status == AllocationStatus.Active,
            Allocation.expected_return_date >= now,
            Allocation.expected_return_date <= now + timedelta(days=7)
        )
    )
    # Overdue returns (expected_return_date in past, returned_at is null)
    overdue_query = select(func.count(Allocation.id)).where(
        and_(
            Allocation.status == AllocationStatus.Active,
            Allocation.expected_return_date < now
        )
    )

    if current_user.role == UserRole.Employee:
        upcoming_query = upcoming_query.where(Allocation.holder_user_id == current_user.id)
        overdue_query = overdue_query.where(Allocation.holder_user_id == current_user.id)
    elif current_user.role == UserRole.DeptHead:
        dept_user_ids = select(User.id).where(User.department_id == current_user.department_id)
        upcoming_query = upcoming_query.where(
            or_(
                Allocation.holder_department_id == current_user.department_id,
                Allocation.holder_user_id.in_(dept_user_ids)
            )
        )
        overdue_query = overdue_query.where(
            or_(
                Allocation.holder_department_id == current_user.department_id,
                Allocation.holder_user_id.in_(dept_user_ids)
            )
        )

    upcoming_res = await db.execute(upcoming_query)
    upcoming_returns = upcoming_res.scalar() or 0

    overdue_res = await db.execute(overdue_query)
    overdue_returns = overdue_res.scalar() or 0

    # Recent Activity Feed
    log_query = select(ActivityLog).options(joinedload(ActivityLog.actor)).order_by(ActivityLog.created_at.desc())
    if current_user.role == UserRole.Employee:
        log_query = log_query.where(ActivityLog.actor_user_id == current_user.id)
    elif current_user.role == UserRole.DeptHead:
        dept_user_ids = select(User.id).where(User.department_id == current_user.department_id)
        log_query = log_query.where(ActivityLog.actor_user_id.in_(dept_user_ids))
        
    log_query = log_query.limit(10)
    log_res = await db.execute(log_query)
    recent_logs = log_res.scalars().all()
    
    recent_activity_out = []
    for log in recent_logs:
        recent_activity_out.append(ActivityLogOut(
            id=log.id,
            actor_user_id=log.actor_user_id,
            actor_user_name=log.actor.name if log.actor else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            created_at=log.created_at
        ))

    return DashboardStats(
        assets_available=assets_avail,
        assets_allocated=assets_allocated,
        maintenance_active=maintenance_active,
        active_bookings=active_bookings,
        pending_transfers=pending_transfers,
        upcoming_returns=upcoming_returns,
        overdue_returns=overdue_returns,
        recent_activity=recent_activity_out
    )

# --- REPORTS & ANALYTICS CHARTS (MANAGERS & ADMINS) ---

@router.get("/utilization-by-dept", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_utilization_by_dept(db: AsyncSession = Depends(get_db)):
    # Group active allocations by department (direct + user department)
    # Direct department allocations
    direct_query = select(Department.name, func.count(Allocation.id)).join(
        Allocation, Allocation.holder_department_id == Department.id
    ).where(Allocation.status == AllocationStatus.Active).group_by(Department.name)
    
    direct_res = await db.execute(direct_query)
    direct_counts = {name: count for name, count in direct_res.all()}

    # User department allocations
    user_query = select(Department.name, func.count(Allocation.id)).join(
        User, User.department_id == Department.id
    ).join(
        Allocation, Allocation.holder_user_id == User.id
    ).where(Allocation.status == AllocationStatus.Active).group_by(Department.name)
    
    user_res = await db.execute(user_query)
    user_counts = {name: count for name, count in user_res.all()}

    # Merge
    all_depts = set(list(direct_counts.keys()) + list(user_counts.keys()))
    utilization = []
    for dept_name in all_depts:
        count = direct_counts.get(dept_name, 0) + user_counts.get(dept_name, 0)
        utilization.append({"department": dept_name, "allocated_assets": count})
        
    return utilization

@router.get("/maintenance-frequency", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_maintenance_frequency(db: AsyncSession = Depends(get_db)):
    # Count maintenance request frequency by month/year
    # In SQLite we can use strftime, in Postgres we can use to_char.
    # To keep it generic or DB-agnostic, we can query dates and group in python, or use extract/strftime.
    # Let's group in python for maximum cross-compatibility (since sqlite is local testing in pytest, postgres is local docker).
    res = await db.execute(select(MaintenanceRequest.created_at))
    dates = res.scalars().all()
    
    monthly_counts = {}
    for dt in dates:
        month_str = dt.strftime("%b %Y")  # e.g. "Mar 2026"
        monthly_counts[month_str] = monthly_counts.get(month_str, 0) + 1
        
    # Format for chart
    return [{"period": k, "requests_count": v} for k, v in monthly_counts.items()]

@router.get("/most-used-assets", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_most_used_assets(db: AsyncSession = Depends(get_db)):
    # Sum bookings + allocations count per asset
    # Subquery allocations count
    alloc_counts = select(Allocation.asset_id, func.count(Allocation.id).label("allocs")).group_by(Allocation.asset_id).subquery()
    
    # Subquery bookings count
    # Bookings are linked to BookableResource which is linked to Asset
    from app.models.models import BookableResource
    booking_counts = select(BookableResource.asset_id, func.count(Booking.id).label("books")).join(
        Booking, Booking.resource_id == BookableResource.id
    ).group_by(BookableResource.asset_id).subquery()

    # Main query
    query = select(
        Asset.tag,
        Asset.name,
        func.coalesce(alloc_counts.c.allocs, 0).label("alloc_count"),
        func.coalesce(booking_counts.c.books, 0).label("booking_count")
    ).outerjoin(
        alloc_counts, alloc_counts.c.asset_id == Asset.id
    ).outerjoin(
        booking_counts, booking_counts.c.asset_id == Asset.id
    ).order_by(desc(func.coalesce(alloc_counts.c.allocs, 0) + func.coalesce(booking_counts.c.books, 0))).limit(10)

    res = await db.execute(query)
    rows = res.all()
    
    out = []
    for r in rows:
        out.append({
            "tag": r[0],
            "name": r[1],
            "allocations": r[2],
            "bookings": r[3],
            "total_uses": r[2] + r[3]
        })
    return out

@router.get("/idle-assets", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_idle_assets(db: AsyncSession = Depends(get_db)):
    # Assets available but not allocated or booked in last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    
    # Find asset ids allocated in last 30 days
    allocated_sub = select(Allocation.asset_id).where(Allocation.allocated_at >= cutoff)
    
    # Booked in last 30 days
    from app.models.models import BookableResource
    booked_sub = select(BookableResource.asset_id).join(
        Booking, Booking.resource_id == BookableResource.id
    ).where(Booking.start_time >= cutoff)

    query = select(Asset).where(
        and_(
            Asset.status == AssetStatus.Available,
            Asset.id.not_in(allocated_sub),
            Asset.id.not_in(booked_sub)
        )
    )
    res = await db.execute(query)
    assets = res.scalars().all()
    
    return [{
        "id": a.id,
        "tag": a.tag,
        "name": a.name,
        "location": a.location,
        "condition": a.condition
    } for a in assets]

@router.get("/nearing-retirement", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_nearing_retirement(db: AsyncSession = Depends(get_db)):
    # Asset acquired more than 5 years ago
    threshold = date.today() - timedelta(days=365*5)
    query = select(Asset).where(Asset.acquisition_date <= threshold)
    res = await db.execute(query)
    assets = res.scalars().all()
    
    return [{
        "id": a.id,
        "tag": a.tag,
        "name": a.name,
        "acquisition_date": a.acquisition_date.isoformat(),
        "cost": float(a.acquisition_cost),
        "status": a.status
    } for a in assets]

@router.get("/booking-heatmap", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def get_booking_heatmap(db: AsyncSession = Depends(get_db)):
    # Group bookings by hour of day (0-23) and day of week (Monday=0, Sunday=6)
    # We load start_time from all bookings and aggregate in python
    res = await db.execute(select(Booking.start_time).where(Booking.status != BookingStatus.Cancelled))
    times = res.scalars().all()
    
    # Initialize grid
    grid = [[0 for _ in range(24)] for _ in range(7)]
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    
    for t in times:
        day_idx = t.weekday()
        hour_idx = t.hour
        grid[day_idx][hour_idx] += 1
        
    out = []
    for day_idx, row in enumerate(grid):
        for hour_idx, val in enumerate(row):
            out.append({
                "day": days[day_idx],
                "hour": hour_idx,
                "bookings_count": val
            })
    return out

@router.get("/export-summary", dependencies=[Depends(RoleChecker([UserRole.Admin, UserRole.AssetManager]))])
async def export_report_summary(db: AsyncSession = Depends(get_db)):
    # Export department valuation summary as CSV
    query = select(
        Department.name,
        func.count(Asset.id).label("allocated_count"),
        func.sum(Asset.acquisition_cost).label("total_valuation")
    ).join(
        Allocation, Allocation.holder_department_id == Department.id
    ).join(
        Asset, Asset.id == Allocation.asset_id
    ).where(Allocation.status == AllocationStatus.Active).group_by(Department.name)
    
    res = await db.execute(query)
    rows = res.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Department Name", "Allocated Assets Count", "Total Valuation Cost ($)"])
    
    for r in rows:
        writer.writerow([r[0], r[1], float(r[2]) if r[2] else 0.0])
        
    output.seek(0)
    
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=department_asset_valuation_summary.csv"}
    )
