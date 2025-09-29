# Team Iron — Fall 2025

This repository contains the MingleMap Expo front end and the Express/Prisma backend that powers it. The tooling is set up so teammates can spin up the Expo client and API in one command against the shared Railway database (or a custom Postgres URL if you supply one).

## 1. Install Prerequisites (once per machine)

| Requirement | macOS | Windows |
|-------------|-------|---------|
| **Node.js 18+ & npm** | `brew install node@18` or download from [nodejs.org](https://nodejs.org/) | Download the 18.x LTS installer from [nodejs.org](https://nodejs.org/) (includes npm) |
| **Git** | `brew install git` or Xcode Command Line Tools | Install [Git for Windows](https://git-scm.com/download/win) |
| **Docker Desktop** (optional, only if you are running your own local Postgres) | Install from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | Install from the same link and ensure WSL2 & virtualization are enabled |
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

## 3. Configure the Database Connection

Create `backend/.env` and set the `DATABASE_URL` you plan to use. Example for the shared Railway instance:

```env
DATABASE_URL="postgresql://postgres:BCYsAkrLYMqaViwdQLKWCbOaxjAfWpLV@interchange.proxy.rlwy.net:22481/railway?sslmode=require&sslaccept=accept_invalid_certs"
```

The stack now runs against the shared Railway instance by default. If you stand up a personal Postgres locally, update the `DATABASE_URL` to point to that instance before starting the stack.

## 4. Run the Whole Stack

From the repository root:

```bash
npm run start-stack
```

The script now targets Railway and runs these steps automatically:

1. Ensure `backend/node_modules` and `frontend/node_modules` exist (runs `npm install` if they do not).
2. Load `DATABASE_URL` from `backend/.env` (or the shell) and check that the host:port is reachable.
3. Start the backend API with `npm run dev` on port `8000`.
4. Detect your LAN address and start Expo with `npm run start -- --lan`, setting `EXPO_PUBLIC_API_URL` to `http://<LAN-IP>:8000` so the mobile app talks to your machine.

No migrations or seed scripts run automatically—your data stays untouched unless you run the commands below yourself. To shut everything down:

```bash
npm run stop-stack
```

The stop script reads `.stack-pids.json`, kills the backend and Expo processes if they are still around, and falls back to a simple name match if the PID file is missing.

### Updating the shared database

Run these only when you intentionally need to change Railway:

```bash
# Apply Prisma migrations (non-destructive)
npm --prefix backend exec prisma migrate deploy

# Re-seed demo users (destructive)
npm --prefix backend run seed
```

Always announce before running the seed because it deletes existing user rows.

## 5. Verify the Railway Connection Anytime

Use the dedicated check script (works on macOS and Windows):

```bash
cd backend
npm test db
```

Successful output shows the host (e.g. `interchange.proxy.rlwy.net:22481`) and the current `User` row count. Failures print a step-by-step checklist (verify `.env`, confirm Railway is online, re-run after fixing connectivity).

## 6. Troubleshooting `npm run start-stack`

If the start script fails, it prints actionable guidance. Most issues fall into one of these buckets:

- **Wrong or missing `.env`** – ensure `backend/.env` has the correct `DATABASE_URL`.
- **Railway unreachable** – check the service status, firewall/VPN rules, and run `npm test db` to confirm connectivity.
- **Outdated installs** – rerun `npm install` inside `backend` and `frontend`.

For more context, see `docs/local-setup.md` or reach out in team chat with the exact error message.

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
