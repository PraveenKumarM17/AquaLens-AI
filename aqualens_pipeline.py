"""
AquaLens AI — Groundwater Early Warning System
Hackathon MVP Pipeline
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import warnings
warnings.filterwarnings("ignore")

# ============================================================
# STEP 1: LOAD YOUR DATA
# Update these file paths to match where your CSVs are stored
# ============================================================

print("Loading data...")

light_df = pd.read_csv("data/nightlight_district_pannel.csv")
water_df = pd.read_csv("data/groundwater.csv")
rain_df  = pd.read_csv("data/rainfall.csv")

# ============================================================
# STEP 2: CLEAN & RENAME — NIGHTLIGHT
# Actual columns: district_id, district_name, state_name,
#   year, min, max, mean, sum, std, median,
#   valid_pixel_count, valid_pixel_share, log1p_mean, log1p_median
# ============================================================

light_df = light_df[["district_name", "state_name", "year", "mean"]].copy()
light_df.columns = ["region", "state", "year", "light"]

# Normalise region names: strip whitespace, title-case
light_df["region"] = light_df["region"].str.strip().str.title()
light_df["state"]  = light_df["state"].str.strip().str.title()

print(f"Nightlight rows: {len(light_df)}")

# ============================================================
# STEP 3: CLEAN & RENAME — GROUNDWATER
# Actual columns: _id, District(D)/Taluk(T)/Hobli(H),
#   Name, Normal (mm), Actual (mm), % DEP, Class
# Data years: 2021, 2022, 2023, 2024
# ============================================================

water_df = water_df[["Name", "% DEP"]].copy()
water_df.columns = ["region", "depletion"]

water_df["region"]    = water_df["region"].str.strip().str.title()
water_df["depletion"] = pd.to_numeric(water_df["depletion"], errors="coerce")

# If there is no year column in groundwater data, assign the years
# present in the file manually. Adjust the list if your CSV already has a year column.
if "year" not in water_df.columns:
    # Assume rows cycle through years 2021-2024 — update if your file has a year column
    # Best approach: add a "year" column to your CSV manually, or do it here:
    # Example: each year block has the same number of rows
    total_rows   = len(water_df)
    years        = [2021, 2022, 2023, 2024]
    rows_per_year = total_rows // len(years)
    year_col     = []
    for y in years:
        year_col.extend([y] * rows_per_year)
    # Handle remainder
    remainder = total_rows - len(year_col)
    year_col.extend([2024] * remainder)
    water_df["year"] = year_col

print(f"Groundwater rows: {len(water_df)}")

# ============================================================
# STEP 4: CLEAN & RENAME — RAINFALL
# Actual columns: _id, Year, Jan–Dec, Total,
#   El NiNo (Y/N), La Nina (Y/N)
# ============================================================

rain_df = rain_df[["Year", "Total"]].copy()
rain_df.columns = ["year", "rainfall"]
rain_df["rainfall"] = pd.to_numeric(rain_df["rainfall"], errors="coerce")

print(f"Rainfall rows: {len(rain_df)}")

# ============================================================
# STEP 5: MERGE
# nightlight + rainfall  →  on year
# then + groundwater     →  on region + year
# ============================================================

print("\nMerging datasets...")

# Karnataka-only nightlight (optional filter)
# light_df = light_df[light_df["state"] == "Karnataka"]

df = pd.merge(light_df, rain_df, on="year", how="inner")
df = pd.merge(df, water_df, on=["region", "year"], how="inner")

print(f"Merged rows: {len(df)}")
print(f"Regions found: {df['region'].nunique()}")
print(f"Years found: {sorted(df['year'].unique())}")

if len(df) == 0:
    print("\n⚠️  MERGE PRODUCED 0 ROWS.")
    print("Check that region names match between nightlight and groundwater CSVs.")
    print("Sample nightlight regions:", light_df["region"].unique()[:5])
    print("Sample groundwater regions:", water_df["region"].unique()[:5])
    exit()

# ============================================================
# STEP 6: SORT
# ============================================================

df = df.sort_values(by=["region", "year"]).reset_index(drop=True)

# ============================================================
# STEP 7: FEATURE ENGINEERING
# ============================================================

print("\nEngineering features...")

# % change in light per region year-over-year
df["light_growth"] = (
    df.groupby("region")["light"]
    .pct_change()
    .fillna(0)
)

# % change in rainfall year-over-year (state-level, same for all regions in same year)
df["rainfall_change"] = (
    df.groupby("year")["rainfall"]
    .transform(lambda x: x.pct_change())
    .fillna(0)
)

# Absolute change in depletion per region
df["depletion_trend"] = (
    df.groupby("region")["depletion"]
    .diff()
    .fillna(0)
)

# ============================================================
# STEP 8: NORMALISE (0–1)
# ============================================================

def minmax(series):
    rng = series.max() - series.min()
    if rng == 0:
        return pd.Series([0.5] * len(series), index=series.index)
    return (series - series.min()) / rng

df["light_norm"]      = minmax(df["light_growth"])
df["rainfall_norm"]   = minmax(-df["rainfall_change"])   # inverse: less rain = higher risk
df["depletion_norm"]  = minmax(-df["depletion_trend"])   # inverse: worsening = higher risk

# ============================================================
# STEP 9: RISK SCORE (WEIGHTED HYBRID)
# ============================================================

print("Computing risk scores...")

df["risk_score"] = (
    0.50 * df["light_norm"] +
    0.30 * df["rainfall_norm"] +
    0.20 * df["depletion_norm"]
)

# ============================================================
# STEP 10: RISK CLASSIFICATION
# ============================================================

def classify_risk(score):
    if score > 0.6:
        return "High"
    elif score > 0.3:
        return "Medium"
    else:
        return "Low"

df["risk"] = df["risk_score"].apply(classify_risk)

# ============================================================
# STEP 11: FUTURE RISK LABEL (EARLY WARNING)
# ============================================================

def future_warning(score):
    if score > 0.6:
        return "High Risk (6-12 months)"
    elif score > 0.3:
        return "Moderate Risk (next year)"
    else:
        return "Low Risk"

df["future_risk"] = df["risk_score"].apply(future_warning)

# ============================================================
# STEP 12: OPTIONAL ML MODEL (RandomForest as supporting layer)
# ============================================================

print("\nTraining ML model...")

features = ["light_norm", "rainfall_norm", "depletion_norm"]
X = df[features]
y = df["risk"]

# Only train if we have enough data
if len(df) >= 10:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    df["ml_risk"] = model.predict(X)

    print("\nML Model Evaluation:")
    print(classification_report(y_test, model.predict(X_test), zero_division=0))

    # Feature importance
    importances = dict(zip(features, model.feature_importances_))
    print("\nFeature Importances:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        print(f"  {feat}: {imp:.3f}")
else:
    print("Not enough data for ML model — using rule-based risk only.")
    df["ml_risk"] = df["risk"]

# ============================================================
# STEP 13: FUTURE FORECAST (extrapolate 2025–2026)
# ============================================================

print("\nGenerating future forecast...")

future_rows = []
for region in df["region"].unique():
    reg_data = df[df["region"] == region].sort_values("year")
    if len(reg_data) == 0:
        continue

    last = reg_data.iloc[-1]

    # Simple trend extrapolation: use last known growth rates
    avg_light_growth = reg_data["light_growth"].mean()

    for future_year in [2025, 2026]:
        projected_light = last["light"] * (1 + avg_light_growth)
        projected_score = min(last["risk_score"] * 1.1, 1.0)  # assume slight worsening

        future_rows.append({
            "region":      region,
            "state":       last.get("state", ""),
            "year":        future_year,
            "light":       round(projected_light, 4),
            "rainfall":    last["rainfall"],
            "depletion":   last["depletion"],
            "risk_score":  round(projected_score, 4),
            "risk":        classify_risk(projected_score),
            "future_risk": future_warning(projected_score),
            "ml_risk":     classify_risk(projected_score),
            "is_forecast": True
        })

future_df = pd.DataFrame(future_rows)
df["is_forecast"] = False

# ============================================================
# STEP 14: SAVE OUTPUT
# ============================================================

import os
os.makedirs("outputs", exist_ok=True)

# Historical predictions
output_cols = [
    "region", "state", "year", "light", "rainfall", "depletion",
    "light_growth", "rainfall_change", "depletion_trend",
    "risk_score", "risk", "future_risk", "ml_risk", "is_forecast"
]
df_out = df[[c for c in output_cols if c in df.columns]]

# Combine historical + forecast
combined = pd.concat([df_out, future_df], ignore_index=True)
combined = combined.sort_values(["region", "year"])

combined.to_csv("outputs/predictions.csv", index=False)
print(f"\n✅ predictions.csv saved — {len(combined)} rows")

# ============================================================
# STEP 15: API-READY JSON OUTPUT (for backend)
# ============================================================

import json

# Latest year per region (for map display)
latest = (
    combined[combined["is_forecast"] == False]
    .sort_values("year")
    .groupby("region")
    .last()
    .reset_index()
)

map_data = []
for _, row in latest.iterrows():
    # Get forecast for this region
    forecasts = combined[
        (combined["region"] == row["region"]) & (combined["is_forecast"] == True)
    ][["year", "risk", "future_risk"]].to_dict(orient="records")

    map_data.append({
        "region":      row["region"],
        "state":       row.get("state", ""),
        "year":        int(row["year"]),
        "light":       round(float(row["light"]), 4),
        "rainfall":    round(float(row["rainfall"]), 2),
        "depletion":   round(float(row["depletion"]), 2),
        "risk_score":  round(float(row["risk_score"]), 4),
        "risk":        row["risk"],
        "future_risk": row["future_risk"],
        "forecast":    forecasts,
        "alert":       (
            f"⚠️ Critical groundwater stress in {row['region']}"
            if row["risk"] == "High" else None
        )
    })

with open("outputs/map_data.json", "w") as f:
    json.dump(map_data, f, indent=2)

print(f"✅ map_data.json saved — {len(map_data)} regions")

# ============================================================
# STEP 16: YEARLY TIME-SERIES JSON (for frontend graph)
# ============================================================

timeseries = {}
for region in combined["region"].unique():
    reg = combined[combined["region"] == region].sort_values("year")
    timeseries[region] = reg[[
        "year", "light", "rainfall", "depletion", "risk_score", "risk", "is_forecast"
    ]].to_dict(orient="records")

with open("outputs/timeseries.json", "w") as f:
    json.dump(timeseries, f, indent=2)

print(f"✅ timeseries.json saved")

# ============================================================
# SUMMARY
# ============================================================

print("\n========== SUMMARY ==========")
print(f"Total regions processed : {df['region'].nunique()}")
print(f"Years covered           : {sorted(df['year'].unique())}")
print(f"Risk distribution:\n{df['risk'].value_counts()}")
print(f"\nHigh-risk regions:")
high = df[df["risk"] == "High"][["region", "year", "risk_score"]].drop_duplicates()
print(high.to_string(index=False) if len(high) else "  None detected")
print("==============================")
print("\nOutput files:")
print("  outputs/predictions.csv  — full data for analysis")
print("  outputs/map_data.json    — for map/frontend")
print("  outputs/timeseries.json  — for graph component")