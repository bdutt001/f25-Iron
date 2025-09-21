# Local Run Guide

Step-by-step notes so any teammate can spin up the backend API, Postgres, and the Expo client against the same data.

## Prerequisites
- Docker Desktop running (or another Docker engine) for the Postgres container.
- Node.js 18+ and npm installed.
- Expo Go app on the physical device (or iOS/Android simulator installed locally).

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
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/minglemap?schema=public
   ```
   Adjust host/port/credentials if your Postgres setup differs.

## Each time you want to run the stack
1. **One-command start (recommended)**
   ```bash
   npm run start-stack
   ```
   The script performs a preflight check and the following steps for you:
   - Spins up Postgres via `docker compose up -d db`.
   - Applies Prisma migrations and seeds the demo users.
   - Starts the backend API (`npm run dev`).
   - Detects your LAN IP and launches Expo with `EXPO_PUBLIC_API_URL` pointing to the backend (`npx expo start --lan`).
   - Gracefully tears everything down (including the DB container) when you hit `Ctrl+C`.
   It will prompt to install missing `node_modules`, create `backend/.env`, or remind you to start Docker Desktop if needed.

   Keep the terminal open while developing. Logs from both backend and Expo stream to the same session.

2. **One-command stop**
   ```bash
   npm run stop-stack
   ```
   This script kills the Expo and backend dev servers, removes the PID file, and tears down the Postgres container—handy if anything is left running in the background.

3. **Try the API** (optional sanity check):
   ```bash
   curl http://localhost:8000/users
   ```
   You should see the seeded users.

## Useful extras
- Run backend tests: `cd backend && npm test` (ensure Postgres is up and migrations applied).
- Regenerate Prisma types after schema changes: `cd backend && npm run generate`.
- Inspect logs from running seeds or dev server: they are printed directly in the terminal sessions that launched them.
