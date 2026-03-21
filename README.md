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

- Backend: http://127.0.0.1:4000
- Frontend: http://localhost:5173

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
