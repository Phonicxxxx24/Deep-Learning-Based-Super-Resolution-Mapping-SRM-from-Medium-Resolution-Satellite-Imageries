# 🚀 Deployment Guide: SRM Platform (Railway + Netlify)

This guide walks you through deploying the complete Super-Resolution Mapping (SRM) system:
- **Backend (FastAPI + PyTorch + Geospatial Pipeline)**: Dockerized and deployed on **[Railway](https://railway.app)**
- **Frontend (Next.js 16 + TailwindCSS + Map UI)**: Deployed on **[Netlify](https://netlify.com)**

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────┐         HTTPS REST & Static PNGs         ┌────────────────────────────────┐
│        Netlify Frontend         │ ───────────────────────────────────────> │        Railway Backend         │
│     (Next.js 16 App Router)     │ <─────────────────────────────────────── │       (FastAPI + Docker)       │
│  https://<site-name>.netlify.app│        CORS Auto-Allowed for Netlify     │https://<app-name>.up.railway.app│
└─────────────────────────────────┘                                          └────────────────────────────────┘
                                                                                              │
                                                                                     ┌────────┴────────┐
                                                                                     │Persistent Volume│
                                                                                     │  /app/data      │
                                                                                     │  /app/outputs   │
                                                                                     └─────────────────┘
```

---

## Part 1: Deploy Backend to Railway

### Step 1: Push Code to GitHub
Ensure all code including `Dockerfile`, `railway.json`, and `.dockerignore` is committed and pushed to your GitHub repository:
```bash
git add .
git commit -m "feat: dockerize backend for Railway and configure frontend for Netlify"
git push origin <your-branch>
```

### Step 2: Create Railway Project
1. Go to **[Railway.app](https://railway.app)** and log in with GitHub.
2. Click **"+ New Project"** → Select **"Deploy from GitHub repo"**.
3. Choose your repository: `Deep-Learning-Based-Super-Resolution-Mapping-SRM-from-Medium-Resolution-Satellite-Imageries`.
4. Railway will automatically detect the `railway.json` and root `Dockerfile`.

### Step 3: Configure Railway Environment Variables & Settings
In your Railway service dashboard:
1. Go to **Variables** tab and add:
   | Variable | Value | Purpose |
   |---|---|---|
   | `PORT` | `8000` | Port for Uvicorn (Railway injects dynamically, default 8000) |
   | `CORS_ORIGINS` | `*` *(or your Netlify URL)* | Allowed CORS origins for browser calls |
   | `CARTO_API_KEY` | *(optional)* | If using CartoDB satellite/dark matter tiles |
2. Go to **Settings** tab:
   - Under **Networking** → Click **"Generate Domain"** (e.g., `srm-backend-production.up.railway.app`).
   - Copy this URL — you will need it for the frontend.
3. *(Optional but Recommended)* Add Persistent Storage:
   - In Railway, click **"+ New"** → **Volume**.
   - Mount path: `/app/data` (for SQLite scans history) and `/app/outputs` (for generated PNGs).

### Step 4: Verify Backend Deployment
Open your browser or terminal to check the health status:
```bash
curl https://<your-railway-url>/health
```
Expected output:
```json
{"status":"ok","jobs_total":0,"queue_depth":0}
```
You can also visit `https://<your-railway-url>/docs` to view the interactive FastAPI Swagger UI.

---

## Part 2: Deploy Frontend to Netlify

### Step 1: Create Site on Netlify
1. Go to **[Netlify.com](https://app.netlify.com)** and log in with GitHub.
2. Click **"Add new site"** → **"Import an existing project"** → Select **GitHub**.
3. Select your repository.

### Step 2: Configure Build Settings
Netlify will automatically read `netlify.toml` from the repository:
- **Base directory**: `frontend` *(already set in `netlify.toml`)*
- **Build command**: `npm run build`
- **Publish directory**: `.next`
- **Node version**: `20`

### Step 3: Set Environment Variables in Netlify
1. Before deploying (or under **Site configuration** → **Environment variables**), click **"Add a variable"**:
   | Key | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<your-railway-url>` | **No trailing slash!** (e.g. `https://srm-backend-production.up.railway.app`) |
   | `NEXT_PUBLIC_API_BASE` | `https://<your-railway-url>` | Alias for consistency |
2. Click **"Deploy site"**.

---

## Part 3: Verify End-to-End Connection

1. Open your Netlify URL (e.g., `https://your-srm.netlify.app`).
2. The interactive map and command center will load.
3. Select a location (e.g., Mumbai Port or London) and click **"Run Super-Resolution"**.
4. The frontend will POST to `https://<your-railway-url>/api/sr/submit` and stream live telemetry:
   - Sentinel-2 L2A tile ingestion from Planetary Computer
   - Sen2SR-RRDB neural inference
   - Spectral metric calculations (PSNR, SSIM, SAM, ERGAS, NDVI)
   - High-resolution comparison slider rendering
5. Navigate to the **Scans Archive** drawer — past scans stored in SQLite will display.
6. Navigate to `/validate` — the benchmark suite will connect to the Railway backend.

---

## 🛠 Local Docker Testing (Optional)

If you want to run the full stack locally via Docker Compose before deploying:
```bash
docker compose up --build
```
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **Swagger Docs**: http://localhost:8000/docs
