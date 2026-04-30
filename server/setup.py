#!/usr/bin/env python
"""
Setup script to generate dataset and train the ML model.
Run this once to prepare the backend for serving predictions.
"""

import sys
from pathlib import Path
import pandas as pd

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from dataset_generator import generate_dataset, save_dataset
from model import WaterPotentialModel


def main():
    print("=" * 60)
    print("AquaLens ML Backend Setup")
    print("=" * 60)
    
    # Step 1: Generate dataset
    print("\n[1/3] Generating year-wise dataset for Bengaluru wards (2012-2024)...")
    df = generate_dataset(n_samples_per_ward=50, random_state=42)
    print(f"✓ Dataset generated: {df.shape[0]} samples, {df.shape[1]} columns")
    print(f"  Ward codes: {df['ward_code'].nunique()}")
    print(f"  Years covered: {df['year'].min()}-{df['year'].max()}")
    print(f"  Score range: {df['water_potential_score'].min()}-{df['water_potential_score'].max()}")
    
    # Step 2: Save dataset
    print("\n[2/3] Saving dataset...")
    dataset_path = save_dataset(df)
    print(f"✓ Dataset saved to {dataset_path}")
    
    # Step 3: Train model
    print("\n[3/3] Training Random Forest model on year-wise data...")
    model = WaterPotentialModel()
    metrics = model.train(df, test_size=0.2, random_state=42)
    print("✓ Model training completed")
    
    # Step 4: Save model
    print("\n[4/4] Saving trained model...")
    model.save()
    print("✓ Model saved")
    
    print("\n" + "=" * 60)
    print("Setup Complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Start the API server:")
    print("   python -m uvicorn main:app --reload --port 8000")
    print("\n2. API will be available at: http://localhost:8000")
    print("3. API documentation: http://localhost:8000/docs")
    print("=" * 60)


if __name__ == "__main__":
    main()
