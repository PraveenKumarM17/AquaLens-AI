#!/usr/bin/env python
"""
Setup script: generates dataset and trains the v3 XGBoost model.
Run once before starting the API server.

Usage:
    python setup.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dataset_generator import generate_dataset, save_dataset
from model import WaterPotentialModel


def main():
    print("=" * 60)
    print("AquaLens ML Backend Setup  (model v3 – XGBoost)")
    print("=" * 60)

    # 1. Generate dataset
    print("\n[1/3] Generating year-wise dataset for Bengaluru wards (2012-2024)…")
    df = generate_dataset(n_samples_per_ward=200, random_state=42)
    print(f"✓ Dataset generated: {df.shape[0]:,} samples, {df.shape[1]} columns")
    print(f"  Wards   : {df['ward_code'].nunique()}")
    print(f"  Years   : {df['year'].min()}–{df['year'].max()}")
    print(f"  Score µ : {df['water_potential_score'].mean():.1f}  "
          f"σ={df['water_potential_score'].std():.1f}  "
          f"range=[{df['water_potential_score'].min()},{df['water_potential_score'].max()}]")

    # 2. Save dataset
    print("\n[2/3] Saving dataset…")
    path = save_dataset(df)
    print(f"✓ Saved to {path}")

    # 3. Train model
    print("\n[3/3] Training XGBoost model…")
    model   = WaterPotentialModel()
    metrics = model.train(df, test_size=0.15, random_state=42)

    print("\n✓ Training complete")
    print(f"  Test R²   : {metrics['test_r2']:.4f}")
    print(f"  Test MAE  : {metrics['test_mae']:.2f} pts")
    print(f"  Test RMSE : {metrics['test_rmse']:.2f} pts")

    r2 = metrics["test_r2"]
    if r2 >= 0.90:
        print(f"\n🎯 Target achieved! R² = {r2:.4f} ≥ 0.90")
    else:
        print(f"\n⚠️  R² = {r2:.4f} – below 0.90 target. Check dataset quality.")

    # 4. Save model
    model.save()
    print("✓ Model saved to models/water_potential_model.pkl")

    print("\n" + "=" * 60)
    print("Setup complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("  python -m uvicorn main:app --reload --port 8000")
    print("  Open http://localhost:8000/docs  for interactive API docs")
    print("=" * 60)


if __name__ == "__main__":
    main()