import pandas as pd
import numpy as np
from pathlib import Path

# Bengaluru BBMP ward metadata (subset of key wards)
BENGALURU_WARDS = [
    {"code": "W001", "name": "Yelahanka", "lat": 13.1021, "lon": 77.5963, "area_sq_km": 45.2},
    {"code": "W002", "name": "Whitefield", "lat": 12.9698, "lon": 77.7500, "area_sq_km": 38.5},
    {"code": "W003", "name": "K.R. Puram", "lat": 13.0050, "lon": 77.6950, "area_sq_km": 42.1},
    {"code": "W004", "name": "Jayangar", "lat": 12.9250, "lon": 77.5938, "area_sq_km": 35.8},
    {"code": "W005", "name": "K.R. Circle", "lat": 12.9716, "lon": 77.5946, "area_sq_km": 28.3},
    {"code": "W006", "name": "Nagarbhavi", "lat": 12.9250, "lon": 77.5500, "area_sq_km": 40.1},
    {"code": "W007", "name": "Mahadevpura", "lat": 13.0500, "lon": 77.6800, "area_sq_km": 48.5},
    {"code": "W008", "name": "Ramamurthy Nagar", "lat": 13.1200, "lon": 77.6400, "area_sq_km": 36.2},
    {"code": "W009", "name": "Marathahalli", "lat": 12.9550, "lon": 77.7100, "area_sq_km": 32.9},
    {"code": "W010", "name": "Varthur", "lat": 12.9650, "lon": 77.7600, "area_sq_km": 44.3},
    {"code": "W011", "name": "Domlur", "lat": 12.9650, "lon": 77.6250, "area_sq_km": 25.5},
    {"code": "W012", "name": "Indiranagar", "lat": 12.9720, "lon": 77.6400, "area_sq_km": 30.1},
    {"code": "W013", "name": "Vasanth Nagar", "lat": 12.9800, "lon": 77.5900, "area_sq_km": 28.7},
    {"code": "W014", "name": "Malleswaram", "lat": 13.0020, "lon": 77.5810, "area_sq_km": 26.4},
    {"code": "W015", "name": "Sadashivanagar", "lat": 13.0100, "lon": 77.5700, "area_sq_km": 24.8},
]

DEFAULT_START_YEAR = 2012
DEFAULT_END_YEAR = 2024


def _year_context(year):
    """Return a normalized year index and trend factors for the dataset."""
    year_index = year - DEFAULT_START_YEAR
    decade_progress = year_index / max(1, DEFAULT_END_YEAR - DEFAULT_START_YEAR)
    return year_index, decade_progress


def generate_dataset(n_samples_per_ward=200, random_state=42, start_year=DEFAULT_START_YEAR, end_year=DEFAULT_END_YEAR):
    """
    Generate a year-wise water potential dataset for Bengaluru wards.
    
    Features:
    - year: observation year
    - rainfall_mm: annual rainfall in mm
    - population_density: people per sq km
    - elevation_m: elevation above sea level
    - groundwater_depth_m: average groundwater table depth
    - urban_area_percent: percentage of urban/built-up area
    - vegetation_percent: percentage of vegetation/green cover
    - road_density_km_per_sq_km: road density metric
    - water_source_proximity_km: distance to nearest surface water source
    """
    np.random.seed(random_state)
    
    data = []
    years = list(range(start_year, end_year + 1))
    
    for ward in BENGALURU_WARDS:
        for year in years:
            year_index, decade_progress = _year_context(year)

            for _ in range(n_samples_per_ward):
                # Base characteristics influenced by latitude/longitude patterns
                lat_factor = (ward["lat"] - 12.9) / 0.2  # normalize lat
                lon_factor = (ward["lon"] - 77.55) / 0.25  # normalize lon

                # Yearly climate and urbanization drift
                climate_cycle = np.sin(year_index * 0.55) * 18
                rainfall_trend = -year_index * 1.8
                urbanization_trend = year_index * 1.7
                groundwater_trend = year_index * 0.35
                road_trend = year_index * 0.12

                # Rainfall: varies by region and year (reduced noise for better correlation)
                rainfall = np.random.normal(640 + lat_factor * 50 + climate_cycle + rainfall_trend, 35)
                rainfall = np.clip(rainfall, 400, 900)

                # Population density: grows through time and by ward (reduced noise)
                pop_density = np.random.normal(8000 + lon_factor * 3000 + year_index * 180, 900)
                pop_density = np.clip(pop_density, 2000, 15000)

                # Elevation: stable by location (low noise, location is fixed)
                elevation = np.random.normal(900 + lat_factor * 30, 5)
                elevation = np.clip(elevation, 850, 950)

                # Groundwater depth: gradually deepens with urbanization and time (reduced noise)
                gw_depth = np.random.normal(24 + pop_density / 520 + groundwater_trend, 2)
                gw_depth = np.clip(gw_depth, 10, 50)

                # Urban area percentage increases over time (reduced noise)
                urban_percent = np.random.normal(min(55 + pop_density / 220 + urbanization_trend, 95), 4)
                urban_percent = np.clip(urban_percent, 20, 95)

                # Vegetation coverage declines as built-up area grows (tightly coupled)
                vegetation_percent = 100 - urban_percent + np.random.normal(0, 2)
                vegetation_percent = np.clip(vegetation_percent, 5, 80)

                # Road density expands with urbanization and time (reduced noise)
                road_density = np.random.normal(8 + pop_density / 1600 + road_trend, 0.8)
                road_density = np.clip(road_density, 2, 15)

                # Distance to water source (inversely correlated with vegetation)
                water_proximity = np.random.normal(3 + (100 - vegetation_percent) / 20 + decade_progress * 0.6, 0.5)
                water_proximity = np.clip(water_proximity, 0.5, 10)

                # Water potential score (target): influenced by multiple factors
                # High potential: more rainfall, vegetation, shallow groundwater, near water sources
                # Low potential: deep groundwater, urban, far from water, low rainfall
                base_score = 50
                base_score += (rainfall - 640) / 260 * 15
                base_score += (100 - urban_percent) / 100 * 20
                base_score -= (gw_depth - 25) / 25 * 15
                base_score -= (water_proximity - 3) / 7 * 10
                base_score += vegetation_percent / 100 * 10
                base_score += (1 - decade_progress) * 4

                score = int(np.clip(base_score + np.random.normal(0, 7), 0, 100))

                data.append({
                    "year": year,
                    "ward_code": ward["code"],
                    "ward_name": ward["name"],
                    "rainfall_mm": rainfall,
                    "population_density": pop_density,
                    "elevation_m": elevation,
                    "groundwater_depth_m": gw_depth,
                    "urban_area_percent": urban_percent,
                    "vegetation_percent": vegetation_percent,
                    "road_density_km_per_sq_km": road_density,
                    "water_source_proximity_km": water_proximity,
                    "water_potential_score": score,
                })
    
    df = pd.DataFrame(data)
    return df


def generate_future_dataset(base_df, start_year=2025, end_year=2030):
    """Generate a simple forecast dataset from the latest historical ward values."""
    if base_df.empty:
        return base_df.copy()

    latest_year = base_df["year"].max()
    latest_rows = base_df[base_df["year"] == latest_year].copy()
    forecasts = []

    for year in range(start_year, end_year + 1):
        year_index = year - latest_year
        for _, row in latest_rows.iterrows():
            rainfall = np.clip(row["rainfall_mm"] - year_index * 4 + np.sin(year * 0.4) * 10, 400, 900)
            population_density = np.clip(row["population_density"] + year_index * 220, 2000, 15000)
            elevation = np.clip(row["elevation_m"], 850, 950)
            groundwater_depth = np.clip(row["groundwater_depth_m"] + year_index * 0.4, 10, 50)
            urban_area_percent = np.clip(row["urban_area_percent"] + year_index * 1.3, 20, 95)
            vegetation_percent = np.clip(100 - urban_area_percent + 5, 5, 80)
            road_density = np.clip(row["road_density_km_per_sq_km"] + year_index * 0.1, 2, 15)
            water_source_proximity = np.clip(row["water_source_proximity_km"] + year_index * 0.15, 0.5, 10)

            score = row["water_potential_score"]
            score += (rainfall - row["rainfall_mm"]) / 30
            score -= (groundwater_depth - row["groundwater_depth_m"]) * 1.2
            score -= (urban_area_percent - row["urban_area_percent"]) * 0.6
            score += (vegetation_percent - row["vegetation_percent"]) * 0.4

            forecasts.append({
                "year": year,
                "ward_code": row["ward_code"],
                "ward_name": row["ward_name"],
                "rainfall_mm": rainfall,
                "population_density": population_density,
                "elevation_m": elevation,
                "groundwater_depth_m": groundwater_depth,
                "urban_area_percent": urban_area_percent,
                "vegetation_percent": vegetation_percent,
                "road_density_km_per_sq_km": road_density,
                "water_source_proximity_km": water_source_proximity,
                "water_potential_score": int(np.clip(score, 0, 100)),
            })

    return pd.DataFrame(forecasts)


def save_dataset(df, filepath="data/bengaluru_water_potential.csv"):
    """Save dataset to CSV."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(filepath, index=False)
    print(f"Dataset saved to {filepath}")
    return filepath


if __name__ == "__main__":
    df = generate_dataset(n_samples_per_ward=50)
    print(f"Generated dataset shape: {df.shape}")
    print(f"\nDataset preview:\n{df.head()}")
    print(f"\nTarget distribution:\n{df['water_potential_score'].describe()}")
    save_dataset(df)
