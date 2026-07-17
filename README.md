# TaskFlow ⚡

TaskFlow is a collaborative, real-time Kanban and task management application. It features standard many-to-many project memberships, role-based access controls (RBAC), live synchronized updates via WebSockets, and a premium dark UI.

---

## 🏗️ Architecture & Technical Stack

The application is built as a split-stack service containerized via Docker:

*   **Backend:** FastAPI (Python 3.12, async) with SQLAlchemy 2.0 ORM, Alembic schema migrations, and native WebSockets for event broadcasting.
*   **Frontend:** Next.js (React, TypeScript) with dynamic state hooks and standard vanilla CSS layout sheets.
*   **Database:** PostgreSQL 16 (Alpine) supporting partial indexes for structural invariants and foreign key cascade rules.

---

## 🛡️ Role-Based Access Control (RBAC)

TaskFlow implements strict server-side RBAC validation. Project members have one of two roles:

| Feature / Action | Owner | Member | Notes |
| :--- | :---: | :---: | :--- |
| **View Board, Backlog & Activity** | ✅ | ✅ | Standard read permission. |
| **Create, Edit & Delete Tasks** | ✅ | ✅ | Standard collaborative actions. |
| **Mark Task as "Done"** | ✅ | ⚠️ | **Only if assignee.** Members cannot close others' tasks. |
| **Invite & Evict Members** | ✅ | ❌ | Admin only (returns `403 Forbidden`). |
| **Change Member Roles** | ✅ | ❌ | Admin only (returns `403 Forbidden`). |
| **Delete Project** | ✅ | ❌ | Admin only (permanently clears all task/activity history). |

---

## 🚀 Quick Start (Docker Compose)

The easiest way to boot the full ecosystem (PostgreSQL, Backend, and Frontend) is via Docker Compose:

### 1. Set up local configs
Copy the example files to initialize the configuration parameters:
```bash
# In backend/
copy .env.example .env

# In frontend/
copy .env.example .env.local
```

### 2. Start the services
Run the containers in build mode:
```bash
docker compose up --build
```
This automatically runs database migrations (`alembic upgrade head`), applies default mock seeds, and opens connections.

### 3. Open in Browser
*   **App Portal:** [http://localhost:3000](http://localhost:3000)
*   **Backend API Swagger Specs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧪 Default Test Accounts

The database comes pre-seeded with two accounts for testing collaboration:

1.  **Alice (Project Owner):**
    *   *Email:* `alice@taskflow.test`
    *   *Password:* `Alice123`
2.  **Bob (Project Member):**
    *   *Email:* `bob@taskflow.test`
    *   *Password:* `Bob12345`

*To test real-time WebSocket syncing, open Alice in your normal browser tab and Bob in an Incognito window side-by-side.*

---

## 🛠️ Key Technical Implementations Done

*   **Atomic Ownership Transfer:** Gated database transactions demote the old owner to standard member automatically inside the same flush, preventing duplicate owner constraint violations.
*   **WebSocket Scoping:** WS events are computed and broadcasted directly to pre-fetched connection pools in-memory, avoiding database queries after transactions commit.
*   **Scale Optimization:** Query ceilings increased to `1000` to allow the Kanban board to load large projects without encountering validation errors.
*   **XSS & CSRF Defenses:** Short-lived JWT tokens live in-memory only, while opaque refresh tokens are managed via `httpOnly`, `Secure`, `SameSite=Strict` cookies.
