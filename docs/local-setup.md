# Local Run Guide

Step-by-step notes so any teammate can spin up the backend API, connect to the shared Railway Postgres instance, and run the Expo client against the same data.

## Prerequisites
- Node.js 18+ and npm installed.
- Expo Go app on the physical device (or iOS/Android simulator installed locally).
- Railway credentials (or an alternate Postgres URL) stored in `backend/.env`.

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
   ```
   Use the shared Railway connection string or substitute the URL for your own database.

## Each time you want to run the stack
1. **One-command start (recommended)**
   ```bash
   npm run start-stack
   ```
   The script now assumes a remote database (Railway by default) and performs the following:
   - Ensures `backend` and `frontend` dependencies are installed.
   - Verifies the database host/port is reachable.
   - Starts the backend API with `npm run dev`.
   - Detects your LAN IP and launches Expo with `EXPO_PUBLIC_API_URL` pointing to your machine's API prefix (`/api`) (`npm run start -- --lan`).
   No migrations or seeds run automatically—your data stays untouched unless you run them manually.

   Keep the terminal open while developing. Logs from both backend and Expo stream to the same session.

2. **One-command stop**
   ```bash
   npm run stop-stack
   ```
   This script kills the Expo and backend dev servers and removes the PID file. If the PID file is missing, it falls back to killing matching processes.

3. **Try the API** (optional sanity check):
   ```bash
   curl http://localhost:8000/users
   ```
   You should see real records from the configured database.

## Useful extras
- Run backend tests: `cd backend && npm test` (ensure the database is reachable first).
- Regenerate Prisma types after schema changes: `cd backend && npm run generate`.
- Apply migrations: `npm --prefix backend exec prisma migrate deploy`.
- Seed demo users (destructive): `npm --prefix backend run seed`.

## Base URL convention

- The Expo client expects `EXPO_PUBLIC_API_URL` to already include the API prefix. Examples:
  - iOS simulator: `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api`
  - Android emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000/api`
  - Physical device on same Wi‑Fi: `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000/api`

Frontend requests should use clean paths like `${API_BASE_URL}/users` (do not add `/api` again).
- Inspect logs from running seeds or dev server: they are printed directly in the terminal sessions that launched them.
