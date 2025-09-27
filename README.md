# Team Iron — Fall 2025

This repository contains the MingleMap Expo front end and the Express/Prisma backend that powers it. The tooling is set up so teammates can spin up the entire stack (Expo + API + Postgres) in one command, whether they rely on a remote Railway database or a local Docker container.

## 1. Install Prerequisites (once per machine)

| Requirement | macOS | Windows |
|-------------|-------|---------|
| **Node.js 18+ & npm** | `brew install node@18` or download from [nodejs.org](https://nodejs.org/) | Download the 18.x LTS installer from [nodejs.org](https://nodejs.org/) (includes npm) |
| **Git** | `brew install git` or Xcode Command Line Tools | Install [Git for Windows](https://git-scm.com/download/win) |
| **Docker Desktop** (only if you want the local Postgres container) | Install from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | Install from the same link and ensure WSL2 & virtualization are enabled |
| **Expo Go mobile app** | Install from the App Store (optional but handy) | Install from Google Play (optional but handy) |
| **Railway access** | Ensure you have the Railway Postgres URL and credentials | same |

> Tip: After installing Docker Desktop, launch it once so the background daemon is running before you start the stack.

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

If you prefer a local Postgres container, set the URL to `postgresql://postgres:postgres@localhost:5432/minglemap?schema=public` (Docker Desktop must be running when you start the stack).

## 4. Run the Whole Stack

From the repository root:

```bash
npm run start-stack
```

The script performs the following:

1. Checks for `node_modules` and offers to run `npm install` if needed.
2. Ensures `backend/.env` exists and reads the database target.
3. If the URL points to localhost, it starts the Docker Postgres container; otherwise it targets Railway.
4. Waits for the database, applies Prisma migrations, and seeds demo users.
5. Logs either `Local Postgres ready …` or `Connected to remote database …` once seeding succeeds.
6. Starts the backend on `http://localhost:8000` and Expo (Metro) with `EXPO_PUBLIC_API_URL` set to the LAN URL of the API.

Stopping everything is just as easy:

```bash
npm run stop-stack
```

That command terminates Expo + backend and tears down the Docker container if one was started.

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
- **Railway unreachable** – check the service status, firewall/VPN rules, and run `npm test db`.
- **Docker not running (local mode)** – start Docker Desktop, then rerun the script.
- **Outdated installs** – rerun `npm install` inside `backend` and `frontend`.

For more context, see `docs/local-setup.md` or reach out in team chat with the exact error message.

## Useful Commands

- `npm test db` (from `backend/`) – quick connectivity test to the configured database.
- `npm run test:unit` (from `backend/`) – Jest test suite.
- `npm run seed` (from `backend/`) – re-seed the demo users.
- `npx prisma migrate dev` – apply pending migrations in development (local DB only).

## Team Members

- bdutt001 — Ben Dutton — bdutt001@odu.edu
- Haynes2 — Geelani Haynes — ghayn004@odu.edu
- jacobneff — Jacob Neff — jneff001@odu.edu
- ashaf007 — Ahmer Shafiq — ashaf007@odu.edu
- GDPMoses — Taran Moses — tmose008@odu.edu
- Nich-Brew — Nicholas Brewster — nbrew004@odu.edu
- dpate024 — Daksh Patel — dpate024@odu.edu
- D-Dobby89 — Dustin Dobson — dmelt002@odu.edu
