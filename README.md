# AssetFlow - Enterprise Asset & Resource Management System

AssetFlow is a production-ready, full-stack ERP system built for physical asset lifecycle tracking, resource allocation, shared booking slots, structured maintenance pipelines, and organization-wide inventory audits. 

The application is structured as a mono-repository containing a FastAPI Python backend, a Next.js (App Router, TypeScript, Tailwind CSS) frontend, and supporting services: PostgreSQL, Redis, MinIO (S3-compatible Storage), and Celery workers/schedulers.

---

## 🏗️ Technical Stack & Architecture

- **Frontend**: Next.js 14 (App Router, TypeScript, Tailwind CSS)
- **Backend**: FastAPI (Python 3.11, async SQLAlchemy 2.0 ORM, Pydantic v2 schemas)
- **Database**: PostgreSQL (relational model with strict transactional constraints)
- **Storage**: MinIO (local S3 bucket integration for asset media and photos)
- **Queue & Broker**: Redis
- **Background Jobs**: Celery (worker processes) + Celery Beat (cron scheduling)
- **Orchestration**: Docker Compose (all services spin up with a single command)

---

## 🚀 Quickstart Guide

To boot up the entire application along with all services, run the following command from the root directory:

```bash
docker-compose up --build
```

This starts the following containers:
- `assetflow_db`: PostgreSQL Database on port `5432`
- `assetflow_redis`: Redis Cache/Broker on port `6379`
- `assetflow_minio`: MinIO Object Storage Console on port `9001` (S3 API on port `9000`)
- `assetflow_minio_init`: Automates S3 bucket setup and configures public download access
- `assetflow_backend`: FastAPI API server on port `8000` (auto-runs migrations and seeds database)
- `assetflow_celery_worker`: Celery worker instance
- `assetflow_celery_beat`: Celery beat scheduler
- `assetflow_frontend`: Next.js development server on port `3000`

### 🌐 Access Links
- **Web App UI**: [http://localhost:3000](http://localhost:3000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Object Storage Dashboard**: [http://localhost:9001](http://localhost:9001) (User: `minioadmin`, Password: `minioadmin123`)

---

## 🔐 Default Demo Accounts (Pre-Seeded)

The database is pre-seeded with departments, categories, and test assets. You can log in using the credentials below:

| Role | Email Address | Password | Scoped Permissions |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@assetflow.com` | `adminpassword` | Full org setup, Employee role promotions, Closed cycle audits, Analytics. |
| **Asset Manager** | `manager@assetflow.com` | `password123` | Asset lifecycle registration, allocations, check-ins, transfer requests, maintenance approvals. |
| **Department Head** | `eng.head@assetflow.com` | `password123` | View department assets, approve transfers/allocations within department. |
| **Employee** | `priya@assetflow.com` | `password123` | View personal assets, book rooms/cars, raise maintenance, request transfers. |

---

## ⚡ Core Business Rules & Data Integrity

1. **Double-Allocation Block (409 Conflict)**:
   - Assets can only be directly allocated when they are in `Available` status.
   - If an asset is already allocated, attempting a direct allocation triggers a hard `409` conflict response from the backend. The API returns the current holder's info (name, department, date) to allow the caller to request a **Transfer Request** instead.
2. **Booking Overlap Prevention**:
   - For shared resources (boardrooms, company vehicles), the backend performs strict interval checking: `[start_time, end_time)`.
   - Any booking slot overlapping an active, non-cancelled booking is rejected with a `409` conflict, returning the occupant's details. Back-to-back bookings (e.g. 10:00–11:00 starting right after a 9:00–10:00 booking) are allowed.
3. **Maintenance Availability Gate**:
   - Approving a maintenance ticket automatically sets the asset status to `UnderMaintenance` and closes any active allocations.
   - Assets in `UnderMaintenance`, `Lost`, `Retired`, or `Disposed` statuses cannot be allocated or booked.
   - Resolving a maintenance ticket updates the asset status back to `Available`.
4. **Audit Cycle Locks**:
   - Once an audit cycle is closed and locked, all checklists become read-only.
   - Confirmed-missing items automatically update the asset status to `Lost` on closure.
5. **Role Gating & Promotion**:
   - Public account registration strictly creates accounts with the `Employee` role.
   - Promoting employees is restricted to `Admin` users and can only be performed via the master Employee Directory panel.
