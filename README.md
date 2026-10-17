# PhysicsPrep AI

PhysicsPrep AI is a local-first study tool for working with physics source PDFs, generating candidate questions, reviewing question quality, and exporting approved questions. It uses a React + Vite frontend, an Express API, and SQLite for local persistence.

## Requirements

- Node.js 20.19+ or 22.12+ (Vite 8 requires a recent Node release)
- npm
- A Gemini API key for AI question generation (other local review screens can be used without generating new questions)

## Setup on Windows

Open PowerShell in the repository folder:

```powershell
npm install
```

Create a local `.env` file in the project root. Do not commit this file:

```dotenv
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
# Optional: comma-separated additional browser origins for a separately hosted frontend
# CORS_ORIGINS=https://your-frontend.example.com
```

The backend loads environment variables from `.env`. Keep your real API key private. The Vite development server proxies `/api` requests to `http://localhost:3001`, so the frontend does not need a hardcoded localhost API URL. For a separately hosted API, set `VITE_API_BASE_URL` in the frontend environment (for example, `https://api.example.com`) before building; do not put secrets in `VITE_` variables.

## Run the app

### Option A — two terminals (recommended for troubleshooting)

Terminal 1:

```powershell
npm run server
```

Leave it running. It should print `PhysicsPrep API running at http://localhost:3001`.

Terminal 2:

```powershell
npm run dev
```

Open the Vite URL printed in Terminal 2, normally http://localhost:5173.

### Option B — one command

```powershell
npm run dev:full
```

This starts the API and Vite development server together.

## Verify the backend

Open http://localhost:3001/api/health in your browser. A healthy server returns JSON with `"status": "ok"`.

The API currently mounts these route groups:

- `/api/health` — backend health check
- `/api/generate` — question generation
- `/api/pdf` — source PDF operations
- `/api/questions` — question CRUD, review, evidence verification, and read-only quality audit
- `/api/dashboard` — dashboard data

The read-only quality audit is available at http://localhost:3001/api/questions/quality-audit. It reports flagged questions and does not modify records.

## Tests and production build

Run these from the repository root:

```powershell
npm test
npm run build
npm run lint
```

With the backend running in a separate terminal, run the read-only API smoke checks:

```powershell
npm run test:api
```

The smoke test checks the health, dashboard, question-list, and PDF-list endpoints without creating, editing, or deleting records. To check a separately hosted API, set `API_BASE_URL` (for example, `$env:API_BASE_URL="http://localhost:3001"`) before running it.

The Node test runner is used for backend logic tests. A successful build confirms that Vite can compile the frontend; the smoke test checks basic API reachability, but neither replaces manual end-to-end testing.

## Question evidence and approval

- Generated questions should remain pending until reviewed.
- Evidence verification checks whether the saved quotation appears in the extracted text of the linked PDF. It does **not** prove that the quotation scientifically supports the question or that the answer is correct; a person must still check both.
- Approval is blocked when required fields or evidence checks fail.
- Editing a question resets its review and evidence status. Verify the quotation again after editing.
- Legacy questions can display as invalid if their stored quotation does not match the linked PDF. Correct the quotation by copying a genuine passage from the linked PDF, save it, verify it, then review it again.

## Local database and backups

The SQLite database is stored under `server/data/`, which is intentionally ignored by Git. This keeps user data and uploaded files out of source control. **Do not delete `server/data/physicsprep.sqlite` to troubleshoot.** Back up the database before experimenting with migrations or data repair. Pulling source-code changes should not overwrite the local database.

## Troubleshooting

- **Port 3001 is busy:** stop the other API process or set `PORT` in `.env` to another free port. If you change the backend port for local development, update the Vite proxy target in `vite.config.js` to match.
- **Frontend loads but questions do not:** check that the API terminal is still running and visit `/api/health`.
- **AI generation fails:** confirm `GEMINI_API_KEY` is present in the root `.env` and restart the backend.
- **Evidence says invalid:** the quotation must match text extracted from the exact linked PDF. Do not mark it verified just to bypass the check.
