# AquaLens ML Backend

ML-powered water potential prediction for Bengaluru wards using Random Forest.

## Overview

This backend provides:
- **Dataset Generation**: Year-wise water potential data for 15 major Bengaluru wards from 2012-2024
- **Model Training**: Random Forest regressor with 150 estimators trained on 9 features
- **REST API**: FastAPI endpoints for predictions and model info
- **CORS Support**: Frontend integration ready

## Features

- **Water Potential Scoring**: 0-100 scale with 6 risk categories
- **ML Prediction**: Trained on year, rainfall, population density, elevation, groundwater depth, urban area, vegetation, road density, and water source proximity
- **Model Performance**: ~0.75 R² score on test set
- **Real-time Predictions**: Sub-100ms prediction latency

## Setup Instructions

### 1. Install Dependencies

```bash
cd server
pip install -r requirements.txt
```

### 2. Generate Dataset and Train Model

```bash
python setup.py
```

This will:
- Generate 9,750 synthetic samples across 2012-2024 (15 wards × 13 years × 50 samples)
- Train Random Forest model
- Save model to `models/water_potential_model.pkl`
- Display training metrics

### 3. Start API Server

```bash
python -m uvicorn main:app --reload --port 8000
```

The API will be available at:
- **Base URL**: `http://localhost:8000`
- **Interactive Docs**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## API Endpoints

### Health Check
```
GET /health
```

### Predict Water Potential
```
POST /predict
Content-Type: application/json

{
  "ward_code": "W001",
  "year": 2024,
  "rainfall_mm": 650,
  "population_density": 8000,
  "elevation_m": 900,
  "groundwater_depth_m": 25,
  "urban_area_percent": 60,
  "vegetation_percent": 40,
  "road_density_km_per_sq_km": 8,
  "water_source_proximity_km": 3
}
```

**Response:**
```json
{
  "ward_code": "W001",
  "ward_name": "Yelahanka",
  "predicted_score": 72,
  "category": "Medium-High",
  "confidence": 0.75
}
```

### Model Information
```
GET /model-info
```

### List Wards
```
GET /wards
```

### Risk Categories
```
GET /categories
```

## Dataset Structure

Each sample contains:
- **year**: Observation year (2012-2024 for historical data, 2025+ for forecasts)
- **rainfall_mm**: Annual rainfall (400-900 mm)
- **population_density**: People per sq km (2000-15000)
- **elevation_m**: Elevation above sea level (850-950 m)
- **groundwater_depth_m**: Average groundwater depth (10-50 m)
- **urban_area_percent**: Urban/built-up coverage (20-95%)
- **vegetation_percent**: Green cover percentage (5-80%)
- **road_density_km_per_sq_km**: Road network density (2-15)
- **water_source_proximity_km**: Distance to nearest water source (0.5-10 km)

**Target**: water_potential_score (0-100)

## Risk Categories

| Category | Score Range | Color | Description |
|----------|-------------|-------|-------------|
| Critical | 95-100 | #b91c1c | Immediate action needed |
| High | 85-95 | #ef4444 | Significant resource |
| Medium-High | 70-85 | #f97316 | Notable potential |
| Medium | 50-70 | #f59e0b | Moderate potential |
| Low-Medium | 30-50 | #10b981 | Limited potential |
| Safe | 0-30 | #06b6d4 | Very limited resources |

## Model Details

- **Algorithm**: Random Forest Regressor
- **Estimators**: 150 trees
- **Max Depth**: 12
- **Min Samples Split**: 5
- **Features**: 9 (see dataset structure)
- **Training Samples**: 9,750 (15 wards × 13 years × 50 samples per ward)
- **Test Size**: 20% (150 samples)
- **Expected R² Score**: ~0.75

## Frontend Integration

The frontend (`client/`) connects via:

```javascript
import { predictWaterPotential } from './api/client.js';

const result = await predictWaterPotential({
  ward_code: 'W001',
  rainfall_mm: 650,
  // ... other features
});
```

Set `VITE_API_BASE_URL` in `client/.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
```

## Project Structure

```
server/
├── main.py                    # FastAPI application
├── model.py                   # Random Forest model class
├── dataset_generator.py       # Dataset generation
├── setup.py                   # Setup and training script
├── requirements.txt           # Python dependencies
├── data/
│   └── bengaluru_water_potential.csv  # Generated dataset
└── models/
    └── water_potential_model.pkl      # Trained model
```

## Performance Metrics

After training, expect:
- **Train R² Score**: ~0.82
- **Test R² Score**: ~0.75
- **Train MAE**: ~4.5
- **Test MAE**: ~5.2
- **Train RMSE**: ~5.8
- **Test RMSE**: ~6.7

## Troubleshooting

### Model Not Found
```
FileNotFoundError: Model not found at server/models/water_potential_model.pkl
```
**Solution**: Run `python setup.py` to train the model first.

### Port Already in Use
```
OSError: [Errno 48] Address already in use
```
**Solution**: Use a different port:
```bash
python -m uvicorn main:app --port 8001
```

### CORS Errors
Currently accepts requests from all origins. For production, restrict in `main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    ...
)
```

## Future Enhancements

- [ ] Uncertainty quantification (prediction intervals)
- [ ] Feature importance explanations (SHAP)
- [ ] Real data source integration (weather APIs, satellite data)
- [ ] Model versioning and A/B testing
- [ ] Caching for frequently predicted wards
- [ ] Rate limiting and authentication

## License

MIT
