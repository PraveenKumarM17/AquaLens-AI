# ⚡ Quick Reference Card

## Start Everything (2 Terminal Tabs)

### Tab 1: Backend
```bash
cd server
run.bat              # Windows
# OR
./run.sh             # Mac/Linux

# Wait for "Uvicorn running on http://127.0.0.1:8000"
```

### Tab 2: Frontend
```bash
cd client
npm run dev

# Wait for "Local: http://localhost:5173/"
```

Then open: **http://localhost:5173/**

---

## Manual Start (More Control)

### Tab 1: Backend Setup (First Time)
```bash
cd server
python -m venv venv
source venv/bin/activate  # Mac/Linux: or venv\Scripts\activate on Windows
pip install -r requirements.txt
python setup.py           # Train model (~1-2 min)
```

### Tab 1: Backend Start (Every Time After)
```bash
cd server
source venv/bin/activate  # or venv\Scripts\activate on Windows
python -m uvicorn main:app --reload --port 8000
```

### Tab 2: Frontend Setup (First Time)
```bash
cd client
npm install
```

### Tab 2: Frontend Start (Every Time After)
```bash
cd client
npm run dev
```

---

## Test Commands

### Health Check
```bash
curl http://localhost:8000/health
```

### Get Prediction
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "ward_code":"W001",
    "rainfall_mm":650,
    "population_density":8000,
    "elevation_m":900,
    "groundwater_depth_m":25,
    "urban_area_percent":60,
    "vegetation_percent":40,
    "road_density_km_per_sq_km":8,
    "water_source_proximity_km":3
  }'
```

### Model Info
```bash
curl http://localhost:8000/model-info
```

### List Wards
```bash
curl http://localhost:8000/wards
```

### List Categories
```bash
curl http://localhost:8000/categories
```

---

## URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend App | http://localhost:5173 | Main dashboard |
| Backend API | http://localhost:8000 | ML predictions |
| API Docs | http://localhost:8000/docs | Swagger UI |
| API ReDoc | http://localhost:8000/redoc | Alternative docs |

---

## Common Issues & Fixes

### Port already in use
```bash
# Use different port
python -m uvicorn main:app --port 8001

# Update client/.env.local
VITE_API_BASE_URL=http://localhost:8001
```

### Dependencies not installed
```bash
# Backend
cd server
pip install -r requirements.txt

# Frontend
cd client
npm install
```

### Model not found
```bash
cd server
python setup.py  # Trains model
```

### Backend not running
```bash
# Check it's actually running:
curl http://localhost:8000/health

# If fails, make sure:
1. Terminal 1 shows "Uvicorn running"
2. Port 8000 is not blocked
3. Python virtual env activated
```

---

## File Locations

- API client: `client/src/api/client.js`
- Backend: `server/main.py`
- Model file: `server/models/water_potential_model.pkl`
- Config: `client/.env.local`
- Frontend component: `client/src/components/BengaluruMap.jsx`

---

## Quick Facts

- **Training time**: ~1-2 minutes (one time)
- **Prediction time**: <100ms per ward
- **Data generated**: 750 samples
- **Model accuracy**: R² ~0.75
- **Wards supported**: 15 major wards (extensible to 150+)
- **Risk bands**: 6 categories (0-100 scale)

---

## Performance

- Frontend loads: ~2 seconds
- ML predictions fetch: ~5 seconds
- Ward selection: instant
- Chart update: instant
- Map re-render: instant

---

## Key Environment Variables

```bash
# Frontend: client/.env.local
VITE_API_BASE_URL=http://localhost:8000

# Backend: No env vars needed for local dev
# For production, modify main.py CORS origins
```

---

## Useful Commands

```bash
# Check Python version
python --version

# Check Node version
node --version

# Rebuild frontend
cd client && npm install

# Retrain model
cd server && python setup.py

# Check API health programmatically
for i in {1..5}; do curl http://localhost:8000/health; done

# Watch backend logs (live)
# Keep terminal running - logs appear automatically

# Clean up (if needed)
# Frontend: rm -rf client/node_modules
# Backend: rm -rf server/venv
```

---

## Keyboard Shortcuts

### Frontend Dev Server
- `h + Enter` = Show help
- `r` = Restart
- `Ctrl+C` = Stop

### Backend Dev Server
- `Ctrl+C` = Stop
- Auto-reloads on Python file changes

### Browser
- `Ctrl+Shift+R` = Hard refresh
- `F12` = Open dev console
- `Ctrl+Alt+I` = Inspect element

---

## Documentation Links

- **Full Setup Guide**: `SETUP_AND_TESTING.md`
- **Backend Docs**: `server/README.md`
- **Completion Summary**: `ML_IMPLEMENTATION_COMPLETE.md`
- **API Swagger**: `http://localhost:8000/docs`

---

## Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟢 "✓ ML Active" badge | Backend connected, using ML predictions |
| 🔄 "Loading ML predictions..." | Fetching predictions on startup |
| 🔴 No badge | API unavailable, using fallback random data |
| 🟡 Cyan colors map | ML-predicted water potential zones |
| 🔴 Red banner alert | Ward has high-risk score (≥85) |

---

## Getting Help

1. **Check logs**: Look at terminal output for error messages
2. **Browser console**: F12 → Console tab for frontend errors
3. **Test API directly**: Use curl commands above
4. **Review docs**: Start with `SETUP_AND_TESTING.md`
5. **Check files**: Verify all files exist in expected locations

---

**Last Updated**: 2024 - AquaLens ML Backend v1.0
