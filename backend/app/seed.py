import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker, Base, engine
from app.core.security import get_password_hash
from app.models.models import User, UserRole, UserStatus, Department, AssetCategory, Asset, BookableResource, Allocation, AllocationStatus, MaintenanceRequest, MaintenancePriority, MaintenanceStatus, Booking, BookingStatus, ActivityLog
from datetime import date, datetime, timezone, timedelta
from app.core.config import settings

async def seed_data():
    print("Initializing database tables...")
    retries = 10
    while retries > 0:
        try:
            async with engine.begin() as conn:
                # Use raw SQL to drop everything — avoids circular FK ordering issues
                await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))
                await conn.execute(text("GRANT ALL ON SCHEMA public TO assetflow"))
                await conn.execute(text("GRANT ALL ON SCHEMA public TO public"))
                # Recreate all tables from the ORM metadata
                await conn.run_sync(Base.metadata.create_all)
            print("Database tables initialized.")
            break
        except Exception as e:
            retries -= 1
            print(f"Database connection failed: {e}. Retrying in 3 seconds ({retries} retries left)...")
            await asyncio.sleep(3)
            
    if retries == 0:
        raise Exception("Failed to connect to the database after multiple retries.")

    async with async_session_maker() as session:
        print("Seeding departments...")
        it_dept = Department(name="IT", status="Active")
        eng_dept = Department(name="Engineering", status="Active")
        ops_dept = Department(name="Operations", status="Active")
        fac_dept = Department(name="Facilities", status="Active")
        session.add_all([it_dept, eng_dept, ops_dept, fac_dept])
        await session.flush()

        print("Seeding bootstrap admin and staff...")
        # Admin
        admin_user = User(
            name="System Admin",
            email=settings.BOOTSTRAP_ADMIN_EMAIL,
            password_hash=get_password_hash(settings.BOOTSTRAP_ADMIN_PASSWORD),
            role=UserRole.Admin,
            status=UserStatus.Active
        )
        
        # Asset Manager
        manager_user = User(
            name="Sarah Jenkins",
            email="manager@assetflow.com",
            password_hash=get_password_hash("password123"),
            role=UserRole.AssetManager,
            status=UserStatus.Active,
            department_id=it_dept.id
        )

        # Department Heads
        eng_head = User(
            name="Aditi Rao",
            email="eng.head@assetflow.com",
            password_hash=get_password_hash("password123"),
            role=UserRole.DeptHead,
            status=UserStatus.Active,
            department_id=eng_dept.id
        )
        fac_head = User(
            name="Rohan Mehta",
            email="fac.head@assetflow.com",
            password_hash=get_password_hash("password123"),
            role=UserRole.DeptHead,
            status=UserStatus.Active,
            department_id=fac_dept.id
        )

        # Employees
        emp_priya = User(
            name="Priya Shah",
            email="priya@assetflow.com",
            password_hash=get_password_hash("password123"),
            role=UserRole.Employee,
            status=UserStatus.Active,
            department_id=eng_dept.id
        )
        emp_arjun = User(
            name="Arjun Nair",
            email="arjun@assetflow.com",
            password_hash=get_password_hash("password123"),
            role=UserRole.Employee,
            status=UserStatus.Active,
            department_id=it_dept.id
        )
        
        session.add_all([admin_user, manager_user, eng_head, fac_head, emp_priya, emp_arjun])
        await session.flush()

        # Update department heads relations
        eng_dept.head_user_id = eng_head.id
        fac_dept.head_user_id = fac_head.id
        it_dept.head_user_id = manager_user.id
        
        # Set hierarchy: IT is parent to Engineering
        eng_dept.parent_department_id = it_dept.id

        print("Seeding asset categories...")
        cat_laptops = AssetCategory(name="Laptops", custom_fields={"warranty_months": 36, "processor": "string"})
        cat_furniture = AssetCategory(name="Furniture", custom_fields={"material": "string"})
        cat_vehicles = AssetCategory(name="Vehicles", custom_fields={"fuel_type": "string", "mileage_limit": "number"})
        cat_rooms = AssetCategory(name="Shared Spaces", custom_fields={"capacity": "number", "projector": "boolean"})
        session.add_all([cat_laptops, cat_furniture, cat_vehicles, cat_rooms])
        await session.flush()

        print("Seeding assets...")
        # Laptops
        laptop1 = Asset(
            tag="AF-0114",
            name="MacBook Pro 16",
            category_id=cat_laptops.id,
            serial_number="C02DFXYZMD6M",
            acquisition_date=date.today() - timedelta(days=365),
            acquisition_cost=2499.00,
            condition="New",
            location="Bengaluru HQ Floor 3",
            is_bookable=False,
            status="Allocated"
        )
        laptop2 = Asset(
            tag="AF-0012",
            name="Dell Latitude 5420",
            category_id=cat_laptops.id,
            serial_number="DELL5420XYZ",
            acquisition_date=date.today() - timedelta(days=730),
            acquisition_cost=1100.00,
            condition="Good",
            location="Bengaluru HQ IT Lab",
            is_bookable=False,
            status="Available"
        )

        # Vehicle
        vehicle1 = Asset(
            tag="AF-0077",
            name="Tesla Model 3",
            category_id=cat_vehicles.id,
            serial_number="5YJ3E1EA8KFXXXXXX",
            acquisition_date=date.today() - timedelta(days=500),
            acquisition_cost=38000.00,
            condition="Good",
            location="HQ Parking Lot A",
            is_bookable=True,
            status="Available"
        )

        # Conference Room
        room1 = Asset(
            tag="AF-0201",
            name="Conference Room B2",
            category_id=cat_rooms.id,
            serial_number=None,
            acquisition_date=date.today() - timedelta(days=1000),
            acquisition_cost=15000.00,
            condition="Good",
            location="HQ Basement B2",
            is_bookable=True,
            status="Available"
        )
        
        # Projector
        projector1 = Asset(
            tag="AF-0062",
            name="Epson 4K Projector",
            category_id=cat_rooms.id,
            serial_number="EPSON6262XYZ",
            acquisition_date=date.today() - timedelta(days=120),
            acquisition_cost=850.00,
            condition="Fair",
            location="HQ Room 102",
            is_bookable=False,
            status="UnderMaintenance"
        )

        session.add_all([laptop1, laptop2, vehicle1, room1, projector1])
        await session.flush()

        print("Seeding bookable resources...")
        tesla_res = BookableResource(asset_id=vehicle1.id, name=vehicle1.name, description="Shared Tesla Model 3 for business trips.")
        room_res = BookableResource(asset_id=room1.id, name=room1.name, description="Basement Conference Room B2 - 12 seater, TV, Glassboard.")
        session.add_all([tesla_res, room_res])
        await session.flush()

        print("Seeding active allocations...")
        # Allocate Laptop 1 to Priya Shah
        alloc1 = Allocation(
            asset_id=laptop1.id,
            holder_user_id=emp_priya.id,
            allocated_at=datetime.now(timezone.utc) - timedelta(days=30),
            expected_return_date=datetime.now(timezone.utc) + timedelta(days=335),
            status=AllocationStatus.Active
        )
        session.add(alloc1)

        print("Seeding maintenance history...")
        # Raise maintenance request for Projector (which is UnderMaintenance)
        mreq1 = MaintenanceRequest(
            asset_id=projector1.id,
            raised_by=emp_arjun.id,
            issue_description="HDMI port is loose, keeps disconnecting.",
            priority="Medium",
            status=MaintenanceStatus.Approved,
            approved_by=manager_user.id,
            created_at=datetime.now(timezone.utc) - timedelta(days=2)
        )
        session.add(mreq1)

        print("Seeding booking schedule...")
        # Book Room B2 for Rohan Mehta today from 14:00 to 15:00
        booking1 = Booking(
            resource_id=room_res.id,
            booked_by=fac_head.id,
            start_time=datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0),
            end_time=datetime.now(timezone.utc).replace(hour=15, minute=0, second=0, microsecond=0),
            status=BookingStatus.Upcoming,
            created_at=datetime.now(timezone.utc) - timedelta(days=1)
        )
        session.add(booking1)

        print("Seeding Activity logs...")
        log1 = ActivityLog(
            actor_user_id=manager_user.id,
            action="ALLOCATE",
            entity_type="Asset",
            entity_id=laptop1.id,
            details={"holder_type": "user", "holder_id": emp_priya.id},
            created_at=datetime.now(timezone.utc) - timedelta(days=30)
        )
        log2 = ActivityLog(
            actor_user_id=fac_head.id,
            action="BOOKING_CREATE",
            entity_type="Booking",
            entity_id=booking1.id,
            details={"start_time": booking1.start_time.isoformat(), "end_time": booking1.end_time.isoformat()},
            created_at=datetime.now(timezone.utc) - timedelta(days=1)
        )
        session.add_all([log1, log2])

        await session.commit()
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    asyncio.run(seed_data())
