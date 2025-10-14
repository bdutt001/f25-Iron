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

> Tip: Keep your Railway URL handy—`npm run start-stack` verifies the database is reachable before launching the dev servers.

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
JWT_ACCESS_TTL="15m"
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

The script now targets Railway and runs the Windows-friendly flow we standardized on. Each time you execute it, it performs the commands below **in order**:

1. `npm install` inside `backend/`
2. `npm install` inside `frontend/`
3. Load `DATABASE_URL` from `backend/.env` (or the shell) and verify the host:port is reachable
4. `npm run dev` inside `backend/` (API on port `8000`)
5. Detect your LAN address and run `npm run start -- --lan` inside `frontend/`, exporting `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000`

Because installs now run every time, expect the first minute of output to be dependency resolution—helpful on Windows where `npm run build` was failing, and harmless on macOS/Linux when everything is already cached.

No migrations or seed scripts run automatically—your data stays untouched unless you run the commands below yourself. To shut everything down:

```bash
npm run stop-stack
```

The stop script reads `.stack-pids.json`, kills the backend and Expo processes if they are still around, and falls back to a simple name match if the PID file is missing.

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

If the start script fails, it prints actionable guidance. Use these checks to get unstuck fast:

- **`npm install` errors** – the script now installs every run; if you see permission or network issues, run `npm install` manually inside `backend/` and `frontend/` to inspect the full error log, then re-run `npm run start-stack`.
- **Wrong or missing `.env`** – confirm `backend/.env` contains the correct `DATABASE_URL` and your front-end `.env` (if used) points to a reachable host for your simulator or device.
- **Railway unreachable** – verify VPN/firewall rules, run `npm test db` from `backend/`, and confirm the host/port printed by the script matches Railway’s latest assignment.
- **Expo cannot reach the API** – double-check the `EXPO_PUBLIC_API_URL` you set for Android/iOS. Android emulators need `http://10.0.2.2:8000`; physical devices must be on the same Wi-Fi and use your LAN IP.

For more context, see `docs/local-setup.md` or drop the exact console output in team chat.

## Useful Commands

- `npm test db` (from `backend/`) – quick connectivity test to the configured database.
- `npm run test:unit` (from `backend/`) – Jest test suite.
- `npm --prefix backend exec prisma migrate deploy` – apply Prisma migrations to Railway.
- `npm --prefix backend run seed` – rebuild demo data (destructive; coordinate before running).

## Team Members

- bdutt001 — Ben Dutton — bdutt001@odu.edu
- Haynes2 — Geelani Haynes — ghayn004@odu.edu
- jacobneff — Jacob Neff — jneff001@odu.edu
- ashaf007 — Ahmer Shafiq — ashaf007@odu.edu
- GDPMoses — Taran Moses — tmose008@odu.edu
- Nich-Brew — Nicholas Brewster — nbrew004@odu.edu
- dpate024 — Daksh Patel — dpate024@odu.edu
- D-Dobby89 — Dustin Dobson — dmelt002@odu.edu
