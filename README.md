# BlenderLab Mini — HTML/CSS/JS + Node backend (no build step)

Production app: vanilla frontend + Express API + Firestore queue + Blender worker + R2 storage.

## Files
- `index.html` / `job.html?id=` / `guide.html` / `style.css` — vanilla frontend
- `config.js` / `samples.js` / `app.js` / `job.js` — frontend logic, plain `fetch` only
- `server.js` — API (`POST /api/submit-job`, `GET /api/job/:id`, `GET /api/runner`) + static hosting
- `worker.js` — Blender worker (preamble + user script + postpass → R2 → Firestore)
- `.github/workflows/blender-runner.yml` — GitHub Actions runner
- `firestore.rules` — Firestore rules (tighten before public launch)

## Run
1. `cp .env.example .env` → fill keys (`FIREBASE_SERVICE_ACCOUNT_KEY`, `GITHUB_TOKEN/OWNER/REPO`, `R2_*`, `CF_ACCOUNT_ID`, `R2_PUBLIC_URL`).
2. `npm install`
3. `npm start` → open `http://localhost:3000`.
4. Blender worker — pick ONE:
   - Local: install Blender, then `npm run worker`.
   - Cloud: push to GitHub, add secrets (`R2_*`, `CF_ACCOUNT_ID`, `FIREBASE_CONFIG`, `R2_PUBLIC_URL`); each job auto-dispatches the workflow.

## Host on Vercel (frontend + API, free tier)
`server.js` can't run on Vercel (no long-lived Node processes), so the same
logic lives as serverless functions in `api/`:
- `api/submit-job.js` ← `POST /api/submit-job`
- `api/job.js` ← `GET /api/job?id=...`
- `api/runner.js` ← `GET /api/runner`
- `api/_db.js` is a helper (underscore = not an endpoint)

Steps:
1. Push this folder to GitHub, then Vercel → Add New → Project → Import.
2. Vercel → Project → Settings → Environment Variables — add the same keys
   as `.env.example` (`FIREBASE_SERVICE_ACCOUNT_KEY`, `GITHUB_TOKEN/OWNER/REPO`,
   `R2_*`, `CF_ACCOUNT_ID`, `R2_PUBLIC_URL`). No `.env` file needed.
3. Deploy. Frontend calls same-origin API automatically (`API_URL: ""`).
4. Blender worker does NOT run on Vercel (needs minutes + a Blender binary).
   It stays on GitHub Actions (`.github/workflows/blender-runner.yml`, excluded
   from deploys via `.vercelignore`) or `npm run worker` on any machine with Blender.

## Pipeline
Submit → `POST /api/submit-job` → Firestore `jobs/{id}` (queued) → runner lock `system/runner` → GitHub dispatch → `worker.js` (`queued`→`processing`→ Blender → R2 upload → `done/failed`) → `job.html` polls `GET /api/job/{id}` → `model-viewer` + downloads.

## Script rule for users
Geometry only (`import bpy` + ≥1 MESH). Worker handles scene clear, lights, camera, materials pass, export. See `guide.html`.
