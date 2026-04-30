# AquaLens Full Stack - Setup & Testing Guide

Complete setup instructions for the full ML-powered water potential prediction system.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend                          │
│                 (client/ directory)                          │
│  - Dashboard with charts                                    │
│  - Interactive Bengaluru map (BBMP wards)                  │
│  - Risk scoring and alerts                                 │
│  - ML integration via API calls                            │
└─────────────┬──────────────────────────────────────────────┘
              │
              │ HTTP REST API
              │ http://localhost:8000
              │
┌─────────────▼──────────────────────────────────────────────┐
│                   Python FastAPI Backend                    │
│                 (server/ directory)                         │
│  - ML model server                                         │
│  - Water potential predictions                            │
│  - CORS-enabled for frontend                             │
└─────────────┬──────────────────────────────────────────────┘
              │
┌─────────────▼──────────────────────────────────────────────┐
│              Random Forest ML Model                        │
│  - 150 estimators, max_depth=12                          │
│  - 8 features (rainfall, groundwater, elevation, etc.)   │
│  - Trained on 750 synthetic samples                      │
│  - R² score ~0.75 on test set                            │
└──────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Node.js 18+** (for frontend)
- **Python 3.8+** (for backend)
- **Git** (optional, for version control)

## Step-by-Step Setup

### Phase 1: Backend Setup (Server - Python ML)

#### 1.1 Navigate to Server Directory
```bash
cd server
```

#### 1.2 Create Virtual Environment (Optional but Recommended)
```bash
# On macOS/Linux
python3 -m venv venv
source venv/bin/activate

# On Windows
python -m venv venv
venv\Scripts\activate
```

#### 1.3 Install Dependencies
```bash
pip install -r requirements.txt
```

Expected output: All packages installed successfully (fastapi, uvicorn, scikit-learn, pandas, numpy, joblib, pydantic)

#### 1.4 Generate Dataset & Train Model
```bash
python setup.py
```

This will:
1. Generate 750 synthetic water potential samples
2. Train Random Forest model (150 trees, 12 max depth)
3. Save model to `models/water_potential_model.pkl`
4. Display training metrics

**Expected training metrics:**
- Train R² Score: ~0.82
- Test R² Score: ~0.75
- Test MAE: ~5.2
- Test RMSE: ~6.7

#### 1.5 Start API Server
```bash
# Quick start script (recommended)
# On Windows:
run.bat

# On macOS/Linux:
chmod +x run.sh
./run.sh

# Or manually:
python -m uvicorn main:app --reload --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete
```

#### 1.6 Verify Backend is Running

Open browser or terminal and test:
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_loaded": true
}
```

### Phase 2: Frontend Setup (Client - React)

#### 2.1 Navigate to Client Directory (New Terminal/Tab)
```bash
cd client
```

#### 2.2 Install Dependencies
```bash
npm install
```

#### 2.3 Configure API Endpoint

The frontend is pre-configured to use `http://localhost:8000` via `.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
```

If using a different backend URL, update this file.

#### 2.4 Start Development Server
```bash
npm run dev
```

**Expected output:**
```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  press h + enter to show help
```

#### 2.5 Open in Browser

Navigate to `http://localhost:5173/`

## Testing the Full System

### Test 1: Verify Backend Health

```bash
# Terminal
curl http://localhost:8000/health
```

Should return `{"status": "healthy", "model_loaded": true}`

### Test 2: Get Model Information

```bash
curl http://localhost:8000/model-info
```

Should return model version, R² score, feature names, etc.

### Test 3: Make a Prediction

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "ward_code": "W001",
    "rainfall_mm": 650,
    "population_density": 8000,
    "elevation_m": 900,
    "groundwater_depth_m": 25,
    "urban_area_percent": 60,
    "vegetation_percent": 40,
    "road_density_km_per_sq_km": 8,
    "water_source_proximity_km": 3
  }'
```

Should return a prediction between 0-100.

### Test 4: Frontend Integration

In browser at `http://localhost:5173/`:

1. **Check Loading Indicator**: Upon page load, you should see "Loading ML predictions..." briefly
2. **Check ML Status**: After loading, green "✓ ML Active" badge appears in top-right of map
3. **Select Ward**: Click any ward on the map
4. **Verify Predictions**: 
   - Chart updates with predicted data
   - Ward color changes based on ML prediction
   - Info panel shows updated score
5. **Check Alerts**: If any ward scores 85+, red alert banner appears at top
6. **Dynamic Updates**: Every 3 seconds, scores vary slightly (±2-3 from ML baseline)

### Test 5: Map Legend & Info

1. Click **Legend** button to toggle legend visibility
2. Click **Info** button to see ML explanation
3. Verify legend shows all 6 risk categories
4. Verify office markers are visible

### Test 6: Fallback Mode (No API)

To test fallback when API is unavailable:

1. Stop backend server (Ctrl+C)
2. Refresh frontend page
3. You should see:
   - No "✓ ML Active" badge
   - Random data generation instead of ML predictions
   - Larger score variations (±5 instead of ±2-3)

## API Endpoints Reference

### Health Check
```
GET /health
```
Returns: `{ "status": "healthy", "model_loaded": bool }`

### Predict Water Potential
```
POST /predict
```
Input:
```json
{
  "ward_code": "W001",
  "rainfall_mm": 650.0,
  "population_density": 8000.0,
  "elevation_m": 900.0,
  "groundwater_depth_m": 25.0,
  "urban_area_percent": 60.0,
  "vegetation_percent": 40.0,
  "road_density_km_per_sq_km": 8.0,
  "water_source_proximity_km": 3.0
}
```
Output:
```json
{
  "ward_code": "W001",
  "ward_name": "Yelahanka",
  "predicted_score": 72,
  "category": "Medium-High",
  "confidence": 0.75
}
```

### Get Model Info
```
GET /model-info
```
Returns: Model version, estimators, R² score, feature names, etc.

### Interactive API Docs
```
http://localhost:8000/docs
```
Auto-generated Swagger UI for all endpoints

## Troubleshooting

### "Module not found: './api/client.js'"
**Solution**: Ensure `client/src/api/client.js` exists. If not, run setup again.

### "Connection refused" on frontend
**Backend not running**. Ensure:
1. Backend terminal shows "Uvicorn running on http://127.0.0.1:8000"
2. Port 8000 is not blocked by firewall
3. Try: `curl http://localhost:8000/health`

### "FileNotFoundError: Model not found"
**Model not trained**. Run: `python setup.py`

### "Port 8000 already in use"
**Solution**: Kill existing process or use different port:
```bash
python -m uvicorn main:app --port 8001
```
Then update `client/.env.local`: `VITE_API_BASE_URL=http://localhost:8001`

### Predictions all return same score
**Possible causes**:
1. Model not trained properly: Check `models/water_potential_model.pkl` exists
2. Features out of range: Check API error details
3. Cache issue: Hard refresh browser (Ctrl+Shift+R)

### Frontend not loading
1. Check `npm run dev` output for errors
2. Verify Node version: `node --version` (should be 18+)
3. Clear `node_modules`: `rm -rf node_modules && npm install`

## File Structure

```
AquaLens-AI/
├── client/                          # React Frontend
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js           # API client (fetch predictions)
│   │   ├── components/
│   │   │   ├── BengaluruMap.jsx    # Map with ML integration
│   │   │   └── RiskTable.jsx
│   │   ├── pages/
│   │   │   └── Dashboard.jsx       # Main dashboard
│   │   ├── data/
│   │   │   └── BBMP.geojson        # Ward polygons
│   │   └── main.jsx
│   ├── .env.local                  # API endpoint config
│   └── package.json
│
├── server/                          # Python ML Backend
│   ├── main.py                     # FastAPI app
│   ├── model.py                    # Random Forest model
│   ├── dataset_generator.py        # Dataset generation
│   ├── setup.py                    # Training script
│   ├── requirements.txt            # Python dependencies
│   ├── run.bat / run.sh           # Quick start scripts
│   ├── data/
│   │   └── bengaluru_water_potential.csv
│   ├── models/
│   │   └── water_potential_model.pkl
│   └── README.md
│
└── README.md                        # Main project README
```

## Next Steps (Optional Enhancements)

1. **Add Authentication**: Secure API endpoints with API keys
2. **Database Integration**: Store predictions and historical data
3. **Real Data Sources**: Replace synthetic data with real weather APIs
4. **Time Series**: Add monthly/yearly trend predictions
5. **Model Versioning**: Support multiple model versions
6. **Deployment**: Deploy to cloud (Heroku, AWS, Azure)
7. **Monitoring**: Add logging and performance metrics
8. **Caching**: Cache predictions for frequently queried wards

## Performance Notes

- **Model Training**: ~30-60 seconds (first time)
- **Prediction Latency**: <100ms per ward
- **Backend Memory**: ~200MB (model + data in memory)
- **Frontend Bundle Size**: ~150KB (React + Leaflet + Recharts)

## Support

If issues arise:
1. Check logs in terminal windows
2. Review error messages in browser console (F12)
3. Test individual components via curl
4. Verify file paths match your directory structure
5. Ensure no port conflicts

---

**Ready to predict water potential?** 🚀
