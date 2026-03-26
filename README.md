# FullStack Portfolio (Fastify + SQLite)

Local-first learning project with:
- Fastify + TypeScript backend
- Prisma + SQLite database
- React + Vite frontend

## 1) First-time setup

From project root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Create env files:

- Copy `backend/.env.example` to `backend/.env`
- Copy `frontend/.env.example` to `frontend/.env`

## 2) Database setup

```bash
npm run db:migrate
npm run db:seed
```

## 3) Run the app

```bash
npm run dev
```

or:

```bash
npm run launch
```

`npm run launch` is now a guarded startup pipeline with explicit failure telemetry.
It classifies and prints hard failure labels before stopping startup, for example:
- `MIGRATION_ERROR` (database migration step failed)
- `BE_FAILED_TO_LAUNCH` (backend did not pass `/health`)
- `DB_POPULATION_FAILED` (login probe failed, seeded auth data missing/broken)
- `FRONTEND_RUNTIME_EXIT` (frontend process exited unexpectedly)
- `BACKEND_RUNTIME_EXIT` (backend process exited unexpectedly)

If guarded launch fails on DB population check, run:

```bash
npm run db:seed
```

If you need to bypass the login probe for a custom local dataset:

```bash
set SKIP_LOGIN_PROBE=1
npm run launch
```

- Backend: http://127.0.0.1:4000
- Frontend: http://localhost:5173

Notes:
- Frontend dev server is pinned to `127.0.0.1:5173` with strict port mode, so port conflicts fail fast instead of silently moving to another port.
- `npm run launch:fast` is available as a shortcut for direct dev startup.

## 4) Test API quickly

Open `backend/requests.http` in VS Code and run:
- `GET /health`
- `GET /projects`

## 5) Reset options

```bash
npm run reset
```

- Drops and recreates SQLite DB from Prisma migrations
- Re-seeds starter data
- Database only, apps stay stopped

```bash
npm run reset:reboot
```

- Resets database
- Immediately launches both backend and frontend

```bash
npm run hard:reset
```

- Deletes local SQLite database files
- Drops and recreates DB from Prisma migrations
- Re-seeds starter data
- Rebuilds both backend and frontend distributions

```bash
npm run hard:reset:reboot
```

- Does everything `hard:reset` does
- Immediately launches both apps
