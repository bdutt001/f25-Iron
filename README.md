# Team Iron — Fall 2025

This repository contains the MingleMap Expo front end and the Express/Prisma backend that powers it. The tooling is set up so teammates can spin up the Expo client and API in one command against the shared Railway database (or a custom Postgres URL if you supply one).

## 1. Install Prerequisites (once per machine)

| Requirement | macOS | Windows |
|-------------|-------|---------|
| **Node.js 18+ & npm** | `brew install node@18` or download from [nodejs.org](https://nodejs.org/) | Download the 18.x LTS installer from [nodejs.org](https://nodejs.org/) (includes npm) |
| **Git** | `brew install git` or Xcode Command Line Tools | Install [Git for Windows](https://git-scm.com/download/win) |
| **Docker Desktop** | Not required |
| **Expo Go mobile app** | Install from the App Store (optional but handy) | Install from Google Play (optional but handy) |
| **Railway access** | Ensure you have the Railway Postgres URL and credentials | same |

## 2. Clone the Repository and Install Dependencies

```bash
# Clone
git clone https://github.com/bdutt001/f25-Iron.git
cd f25-Iron

# Install backend deps
cd backend
npm install

# Install frontend deps
cd ../frontend
npm install
```

These installs work the same in macOS Terminal, iTerm2, Windows Terminal, or PowerShell.

## 3. Configure Environment Files

### Backend API (`backend/.env`)

Create `backend/.env` and set the `DATABASE_URL` you plan to use. Example for the shared Railway instance:

```env
DATABASE_URL="postgresql://postgres:BCYsAkrLYMqaViwdQLKWCbOaxjAfWpLV@interchange.proxy.rlwy.net:22481/railway?sslmode=require&sslaccept=accept_invalid_certs"
JWT_ACCESS_SECRET="replace-with-a-long-random-string"
JWT_REFRESH_SECRET="replace-with-a-different-long-random-string"
# Optional overrides; defaults are 15m and 7d
JWT_ACCESS_TTL="24h"
JWT_REFRESH_TTL="7d"
```

The start script reads this file on boot. If you stand up a personal Postgres locally, update `DATABASE_URL` to that instance before starting the stack. Generate strong JWT secrets locally (e.g., `openssl rand -hex 32`) and never reuse production values across environments.

### Expo app (`frontend/.env*`)

`start-stack` injects `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000` so physical devices and simulators can reach the backend on your machine. When you launch Expo outside of the stack script, create a `.env` inside `frontend/` and add the base URL you want embedded at build time:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000
```

Simulator-specific values:

- **iOS simulator** — can talk to the host via loopback, so use `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000` and run `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npm run ios` from `frontend/`.
- **Android emulator** — Expo uses the Android emulator network stack; point to the host with `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000` and start with `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000 npm run android`.
- **Physical devices** — keep the LAN IP from `start-stack` (or set it manually in `.env`) so phones on the same Wi-Fi can connect.

Expo will also read `.env.development`, `.env.production`, or `.env.local` if you prefer to keep per-mode copies. Just ensure every file defines `EXPO_PUBLIC_API_URL` before launching the client.

## 4. Run the Whole Stack

From the repository root:

```bash
npm run start-stack
```

The script now runs the same on macOS and Windows. Each time you execute it, it performs the commands below **in order**:

1. `npm install` inside `backend/`
2. `npm install` inside `frontend/`
3. `npm run dev` inside `backend/` (API on port `8000`)
4. Detect your LAN address and run `npm run start -- --lan` inside `frontend/`, exporting `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000`

That’s it—no automatic database checks or migrations. If you’d rather handle installs manually, run `npm install` in each package first; subsequent `start-stack` runs will breeze through steps 1–2 because everything is already cached.

No migrations or seed scripts run automatically—your data stays untouched unless you run the commands below yourself. When you’re done, press `Ctrl+C` in that terminal to stop both the backend and Expo processes.

### Updating the shared database

Run schema migrations when you intentionally need to change Railway:

```bash
# Apply Prisma migrations (non-destructive)
npm --prefix backend exec prisma migrate deploy
```

Seeding demo data has been removed to avoid accidental destructive changes to the shared Railway database.

## 5. Verify the Railway Connection Anytime

Use the dedicated check script (works on macOS and Windows):

```bash
cd backend
npm test db
```

Successful output shows the host (e.g. `interchange.proxy.rlwy.net:22481`) and the current `User` row count. Failures print a step-by-step checklist (verify `.env`, confirm Railway is online, re-run after fixing connectivity).

## 6. Troubleshooting `npm run start-stack`

If the start script fails, use these checks to get unstuck fast:

- **`npm install` errors** – the script installs dependencies every run. If you see permission or network errors, run `npm install` manually inside `backend/` and `frontend/` to read the full logs, fix the issue, then re-run `npm run start-stack`.
- **Backend cannot connect to Postgres** – the script no longer validates `DATABASE_URL` for you. If the API process crashes immediately, re-check `backend/.env` and run `npm test db` to confirm the database is reachable from your machine.
- **Expo cannot reach the API** – confirm the `EXPO_PUBLIC_API_URL` the script printed works for your platform. Android emulators need `http://10.0.2.2:8000`; iOS simulator can use `http://127.0.0.1:8000`; physical devices must be on the same Wi-Fi and use your LAN IP.

For more context, see `docs/local-setup.md` or drop the exact console output in team chat.

## Useful Commands

- `npm test db` (from `backend/`) – quick connectivity test to the configured database.
- `npm run test:unit` (from `backend/`) – backend unit tests (Prisma mocked; safe to run anytime).
- `npm run test:integration` (from `backend/`) – full API tests against whatever `DATABASE_URL` points to. Use a disposable Postgres database before running.
- `npm run test` (from `frontend/`) – Expo/Jest component + helper tests (purely local, relies on mocks).
- `npm run test` (repo root) – runs backend unit tests then frontend Jest tests; this is what CI executes.
- `npm --prefix backend exec prisma migrate deploy` – apply Prisma migrations to Railway.
- `npm --prefix backend run seed` – rebuild demo data (destructive; coordinate before running).

## Continuous Integration

The GitHub Actions workflow in `.github/workflows/ci.yml` runs on every push/PR to `main`. It installs dependencies for the repo root, backend, and frontend, then executes `npm run test` (backend unit suite) followed by `npm run test:frontend`. Keep both suites green before opening a PR—fails will block merges.

## Team Members

- bdutt001 — Ben Dutton — bdutt001@odu.edu
- Haynes2 — Geelani Haynes — ghayn004@odu.edu
- jacobneff — Jacob Neff — jneff001@odu.edu
- ashaf007 — Ahmer Shafiq — ashaf007@odu.edu
- GDPMoses — Taran Moses — tmose008@odu.edu
- Nich-Brew — Nicholas Brewster — nbrew004@odu.edu
- dpate024 — Daksh Patel — dpate024@odu.edu
- D-Dobby89 — Dustin Dobson — dmelt002@odu.edu
