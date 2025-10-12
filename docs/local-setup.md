# Local Run Guide

Step-by-step notes so any teammate can spin up the backend API, connect to the shared Railway Postgres instance, and run the Expo client against the same data.

## Prerequisites
- Node.js 18+ and npm installed.
- Expo Go app on the physical device (or iOS/Android simulator installed locally).
- Railway credentials stored in `backend/.env`.

## One-time project setup
1. Install backend packages:
   ```bash
   cd backend
   npm install
   ```
2. Install frontend packages:
   ```bash
   cd ../frontend
   npm install
   ```
3. Create the backend environment file if it does not exist (`backend/.env`):
   ```env
   DATABASE_URL="postgresql://<username>:<password>@<host>:<port>/<database>?sslmode=require"
   JWT_ACCESS_SECRET="replace-with-a-long-random-string"
   JWT_REFRESH_SECRET="replace-with-a-different-long-random-string"
   # Optional overrides; defaults are 15m and 7d respectively
   JWT_ACCESS_TTL="15m"
   JWT_REFRESH_TTL="7d"
   ```
   Use the shared Railway connection string or substitute the URL for your own database. The JWT secrets power access and refresh tokens—generate strong values locally (e.g., `openssl rand -hex 32`) and never commit real secrets to version control.

## Each time you want to run the stack
1. **One-command start (recommended)**
   ```bash
   npm run start-stack
   ```
   The script now assumes a remote database (Railway by default) and performs the following:
   - Ensures `backend` and `frontend` dependencies are installed.
   - Verifies the database host/port is reachable.
   - Starts the backend API with `npm run dev`.
   - Detects your LAN IP and launches Expo with `EXPO_PUBLIC_API_URL` pointing to your machine (no `/api` suffix) (`npm run start -- --lan`).
   No migrations run automatically—your data stays untouched unless you run them manually.

   Keep the terminal open while developing. Logs from both backend and Expo stream to the same session.

2. **One-command stop**
   ```bash
   npm run stop-stack
   ```
   This script kills the Expo and backend dev servers and removes the PID file. If the PID file is missing, it falls back to killing matching processes.

3. **Try the API** (optional sanity check):
   ```bash
   curl http://localhost:8000/api
   ```
   You should receive `{ "status": "ok" }`. Protected routes (e.g., `/auth/me`, `/api/users`) now require a `Bearer` token obtained via `/auth/login` or `/auth/register`.

## Useful extras
- Run backend tests: `cd backend && npm test` (ensure the database is reachable first).
- Regenerate Prisma types after schema changes: `cd backend && npm run generate`.
- Apply migrations: `npm --prefix backend exec prisma migrate deploy`.

## Base URL convention

- The Expo client now uses a base URL without `/api`. Examples:
  - iOS simulator: `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000`
  - Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`
  - Physical device on same Wi‑Fi: `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000`

Frontend requests should use paths like `${API_BASE_URL}/users` and `${API_BASE_URL}/auth/login`. The backend also supports the older `/api/*` paths for compatibility.
There is no seed command in this project to protect the shared Railway database from accidental resets.
