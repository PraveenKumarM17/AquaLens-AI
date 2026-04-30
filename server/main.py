from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Optional
import os
import sys
from pathlib import Path

# Add server directory to path
sys.path.insert(0, str(Path(__file__).parent))

from model import WaterPotentialModel, WaterPotentialModel
from dataset_generator import BENGALURU_WARDS

# Initialize FastAPI app
app = FastAPI(
    title="AquaLens Water Potential API",
    description="ML-powered water potential prediction for Bengaluru wards",
    version="1.0.0",
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (can be restricted to frontend URL)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
model_instance = None


class FeaturesInput(BaseModel):
    """Input features for water potential prediction."""
    ward_code: str
    year: int = Field(2024, ge=2012, le=2030)
    rainfall_mm: float = Field(..., ge=400, le=900)
    population_density: float = Field(..., ge=2000, le=15000)
    elevation_m: float = Field(..., ge=850, le=950)
    groundwater_depth_m: float = Field(..., ge=10, le=50)
    urban_area_percent: float = Field(..., ge=20, le=95)
    vegetation_percent: float = Field(..., ge=5, le=80)
    road_density_km_per_sq_km: float = Field(..., ge=2, le=15)
    water_source_proximity_km: float = Field(..., ge=0.5, le=10)


class PredictionOutput(BaseModel):
    """Prediction output."""
    ward_code: str
    ward_name: Optional[str]
    predicted_score: int
    category: str
    confidence: float


class ModelInfoOutput(BaseModel):
    """Model information output."""
    model_version: str
    n_estimators: int
    max_depth: int
    feature_names: list
    r2_score: float
    training_samples: int


def score_to_category(score: int) -> str:
    """Convert score to risk category."""
    if score >= 95:
        return "Critical"
    elif score >= 85:
        return "High"
    elif score >= 70:
        return "Medium-High"
    elif score >= 50:
        return "Medium"
    elif score >= 30:
        return "Low-Medium"
    else:
        return "Safe"


def load_model():
    """Load model on startup."""
    global model_instance
    model_path = Path(__file__).parent / "models" / "water_potential_model.pkl"
    
    if model_path.exists():
        print(f"Loading model from {model_path}")
        model_instance = WaterPotentialModel.load(str(model_path))
    else:
        raise FileNotFoundError(f"Model not found at {model_path}. Run model training first.")


@app.on_event("startup")
async def startup_event():
    """Initialize model on startup."""
    try:
        load_model()
        print("✓ Model loaded successfully")
    except Exception as e:
        print(f"✗ Failed to load model: {e}")
        raise


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": model_instance is not None,
    }


@app.post("/predict", response_model=PredictionOutput, tags=["Predictions"])
async def predict_water_potential(features: FeaturesInput):
    """
    Predict water potential score for a Bengaluru ward.
    
    Returns predicted score (0-100), risk category, and confidence level.
    """
    if model_instance is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    try:
        # Prepare features dictionary
        features_dict = {
            "year": features.year,
            "rainfall_mm": features.rainfall_mm,
            "population_density": features.population_density,
            "elevation_m": features.elevation_m,
            "groundwater_depth_m": features.groundwater_depth_m,
            "urban_area_percent": features.urban_area_percent,
            "vegetation_percent": features.vegetation_percent,
            "road_density_km_per_sq_km": features.road_density_km_per_sq_km,
            "water_source_proximity_km": features.water_source_proximity_km,
        }
        
        # Get prediction
        score = model_instance.predict(features_dict)
        category = score_to_category(score)
        
        # Calculate confidence (based on test R² and score range)
        r2 = model_instance.r2_score or 0.75
        confidence = min(0.95, max(0.60, r2))
        
        # Find ward name
        ward_name = None
        for ward in BENGALURU_WARDS:
            if ward["code"] == features.ward_code:
                ward_name = ward["name"]
                break
        
        return PredictionOutput(
            ward_code=features.ward_code,
            ward_name=ward_name,
            predicted_score=score,
            category=category,
            confidence=round(confidence, 3),
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {str(e)}")


@app.get("/model-info", response_model=ModelInfoOutput, tags=["Model"])
async def get_model_info():
    """Get information about the trained model."""
    if model_instance is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    return ModelInfoOutput(
        model_version=model_instance.model_version,
        n_estimators=model_instance.model.n_estimators,
        max_depth=model_instance.model.max_depth,
        feature_names=model_instance.feature_names,
        r2_score=round(model_instance.r2_score, 4),
        training_samples=model_instance.training_samples,
    )


@app.get("/wards", tags=["Reference"])
async def get_bengaluru_wards():
    """Get list of all Bengaluru wards in database."""
    return {
        "count": len(BENGALURU_WARDS),
        "wards": BENGALURU_WARDS,
    }


@app.get("/categories", tags=["Reference"])
async def get_risk_categories():
    """Get risk score categories and color mappings."""
    return {
        "categories": [
            {
                "name": "Critical",
                "min_score": 95,
                "max_score": 100,
                "color": "#b91c1c",
                "description": "Critical water potential - immediate action needed",
            },
            {
                "name": "High",
                "min_score": 85,
                "max_score": 95,
                "color": "#ef4444",
                "description": "High water potential - significant resource",
            },
            {
                "name": "Medium-High",
                "min_score": 70,
                "max_score": 85,
                "color": "#f97316",
                "description": "Medium-high water potential",
            },
            {
                "name": "Medium",
                "min_score": 50,
                "max_score": 70,
                "color": "#f59e0b",
                "description": "Medium water potential",
            },
            {
                "name": "Low-Medium",
                "min_score": 30,
                "max_score": 50,
                "color": "#10b981",
                "description": "Low-medium water potential",
            },
            {
                "name": "Safe",
                "min_score": 0,
                "max_score": 30,
                "color": "#06b6d4",
                "description": "Safe zone - limited water resources",
            },
        ]
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
