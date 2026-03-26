## Interview Management System

A full-stack internal tool for managing user verification interviews at Wingmann — a serious-intent dating platform where every member completes a short interview before gaining access.

## Tech stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 19, Vite 8, React Router v7, CSS Modules |
| Backend  | Node.js 24, Express 5, Socket.io 4  |
| Database | PostgreSQL (with raw SQL migrations)|
| Auth     | Google OAuth 2.0 (users) + JWT + bcrypt (interviewers) |
| Testing  | Jest, Supertest (Backend) + Vitest, RTL (Frontend) |

## Quick Start (Start in one command)

Once you have your `.env` files set up (see below), you can start both services from the root directory:

```bash
npm run install:all    # Install all dependencies (root, backend, frontend)
npm run dev            # Start both backend and frontend concurrently
```

## Architecture

```
package.json           Root configuration for single-command start
backend/
  src/
    config/            DB pool, JWT utilities
    middleware/        authenticate, requireRole, requirePasswordChanged
    migrations/        001–006 SQL files + migration runner
    db/                slotGenerator.js, bookingTransaction.js
    routes/            auth.js, user.js, interviewer.js, admin.js
    tests/             Jest integration tests (auth, slots)
    index.js           Express + Socket.io server
frontend/
  src/
    components/ui/     Shared UI components (with Vitest unit tests)
    pages/             Role-based views (User, Interviewer, Admin)
    tests/             Vitest setup
```

### Key design decisions

**Single users table, role enum** — all three actor types (user, interviewer, admin) share one table with a `role` column. Auth middleware gates routes via `requireRole(...roles)`. Simpler than three separate tables, easy to extend.

**Materialised slots** — when an interviewer sets an availability window (e.g. Mon 10am–2pm), the backend immediately generates discrete 30-min slot rows in the `slots` table. Users browse and book these directly. No runtime computation on the hot path.

**SELECT FOR UPDATE** — concurrent booking uses `BEGIN / SELECT ... FOR UPDATE / UPDATE / COMMIT`. The row lock on the slot prevents two users claiming the same slot simultaneously. A partial unique index `ON bookings(user_id) WHERE status IN ('pending','confirmed')` enforces one-active-booking-per-user at the DB level as a second line of defence.

**Observer pattern** — when an interviewer records a decision, the backend emits a `interview:outcome` WebSocket event to a user-specific room (`socket.join(userId)`). The user dashboard updates live without polling.

**Soft deletes for interviewers** — deactivating an interviewer sets `is_active = FALSE` and moves their pending bookings to `reassigned` status. No booking data is lost; admin can reassign.

## How to run locally

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Database
```bash
createdb wingmann_ims
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# Fill in DB credentials, JWT_SECRET, Google OAuth keys, SMTP settings
npm install
npm run db:migrate    # applies all 6 migrations in order
npm run dev           # starts on http://localhost:4000
```

Check migration status anytime:
```bash
npm run db:status
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev           # starts on http://localhost:5173
```

## Testing

The project includes both backend integration tests and frontend unit tests.

### Running all tests
From the root directory:
```bash
npm run test:all
```

### Backend Tests (Jest)
```bash
cd backend
npm test
```

### Frontend Tests (Vitest)
```bash
cd frontend
npm test
```

### 4. Google OAuth setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add `http://localhost:4000/api/auth/google/callback` as an authorised redirect URI
4. Copy `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `backend/.env`

## Core product flows

### User flow
1. Sign up via Google → fill profile (name, age, gender, city)
2. Browse available 30-min interview slots
3. Book a slot (one active booking enforced)
4. Attend interview → receive live outcome on dashboard

### Interviewer flow
1. Receive auto-generated credentials via email from admin
2. Set availability windows → slots materialise automatically
3. View upcoming interviews on dashboard
4. After each interview, record Accept or Reject → user is notified live

### Admin flow
1. Add interviewers → system generates credentials, sends email
2. Monitor all scheduled interviews in a table
3. View each interviewer's remaining available hours
4. Deactivate interviewers → reassign their pending bookings

## API overview

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | any | Local login |
| GET | `/api/auth/google` | — | OAuth redirect |
| GET | `/api/auth/me` | authenticated | Current user |
| POST | `/api/user/profile` | user | Complete profile |
| GET | `/api/user/slots` | user | Browse available slots |
| POST | `/api/user/bookings` | user | Book a slot |
| GET | `/api/user/booking` | user | Active booking + outcome |
| DELETE | `/api/user/bookings/:id` | user | Cancel (24h window) |
| POST | `/api/interviewer/availability` | interviewer | Add availability |
| GET | `/api/interviewer/availability` | interviewer | List own windows |
| DELETE | `/api/interviewer/availability/:id` | interviewer | Remove window |
| GET | `/api/interviewer/interviews` | interviewer | Upcoming + completed |
| GET | `/api/interviewer/stats` | interviewer | Availability hours |
| POST | `/api/interviewer/interviews/:id/decide` | interviewer | Record outcome |
| GET | `/api/admin/interviewers` | admin | List team |
| POST | `/api/admin/interviewers` | admin | Create interviewer |
| DELETE | `/api/admin/interviewers/:id` | admin | Deactivate |
| GET | `/api/admin/interviews` | admin | All interviews |
| POST | `/api/admin/bookings/:id/reassign` | admin | Reassign booking |
