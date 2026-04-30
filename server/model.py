import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path
from dataset_generator import generate_dataset


class WaterPotentialModel:
    def __init__(self):
        self.model = None
        self.feature_names = [
            "year",
            "rainfall_mm",
            "population_density",
            "elevation_m",
            "groundwater_depth_m",
            "urban_area_percent",
            "vegetation_percent",
            "road_density_km_per_sq_km",
            "water_source_proximity_km",
        ]
        # Derived/interaction features
        self.derived_features = [
            "rainfall_veg_interaction",
            "urban_gw_interaction",
            "pop_density_normalized",
            "groundwater_pressure_index",
            "water_availability_index",
        ]
        self.scaler = None
        self.scaler_params = {}
        self.r2_score = None
        self.training_samples = 0
        self.model_version = "2.0"
    
    def engineer_features(self, df):
        """Create derived and interaction features to improve model performance."""
        df = df.copy()
        
        # Interaction: rainfall × vegetation (high rainfall + high vegetation = high potential)
        df["rainfall_veg_interaction"] = (
            (df["rainfall_mm"] / df["rainfall_mm"].max()) * 
            (df["vegetation_percent"] / 100)
        )
        
        # Interaction: urban area × groundwater depth (urbanization depletes groundwater)
        df["urban_gw_interaction"] = (
            (df["urban_area_percent"] / 100) * 
            (df["groundwater_depth_m"] / df["groundwater_depth_m"].max())
        )
        
        # Normalize population density (high density = lower water availability)
        df["pop_density_normalized"] = df["population_density"] / df["population_density"].max()
        
        # Groundwater pressure index (shallower = higher potential)
        df["groundwater_pressure_index"] = 1 - (df["groundwater_depth_m"] / df["groundwater_depth_m"].max())
        
        # Water availability index (combines multiple factors)
        df["water_availability_index"] = (
            (df["rainfall_mm"] / 800) * 0.3 +
            (1 - df["urban_area_percent"] / 100) * 0.3 +
            df["groundwater_pressure_index"] * 0.2 +
            (1 - df["water_source_proximity_km"] / 10) * 0.2
        )
        
        return df
    
    def train(self, df, test_size=0.15, random_state=42):
        """Train Gradient Boosting model with feature engineering."""
        print("Engineering features...")
        df = self.engineer_features(df)
        
        all_features = self.feature_names + self.derived_features
        print(f"Total features: {len(all_features)}")
        
        X = df[all_features]
        y = df["water_potential_score"]
        
        # Normalize features
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)
        X_scaled = pd.DataFrame(X_scaled, columns=all_features)
        
        # Store feature statistics for normalization reference
        self.scaler_params = {
            "feature_means": X.mean().to_dict(),
            "feature_stds": X.std().to_dict(),
        }
        self.training_samples = len(df)
        
        # Split data (more training data = better model)
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=test_size, random_state=random_state
        )
        
        # Train Gradient Boosting (better than Random Forest for this problem)
        print("Training Gradient Boosting Regressor...")
        self.model = GradientBoostingRegressor(
            n_estimators=200,           # More estimators
            learning_rate=0.05,         # Slower learning = better generalization
            max_depth=7,                # Moderate depth
            min_samples_split=4,
            min_samples_leaf=2,
            subsample=0.8,              # Stochastic boosting
            random_state=random_state,
            verbose=1,
        )
        
        self.model.fit(X_train, y_train)
        
        # Evaluate
        print("\nEvaluating model...")
        y_pred_train = self.model.predict(X_train)
        y_pred_test = self.model.predict(X_test)
        
        train_r2 = r2_score(y_train, y_pred_train)
        test_r2 = r2_score(y_test, y_pred_test)
        train_mae = mean_absolute_error(y_train, y_pred_train)
        test_mae = mean_absolute_error(y_test, y_pred_test)
        train_rmse = np.sqrt(mean_squared_error(y_train, y_pred_train))
        test_rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
        
        self.r2_score = test_r2
        
        print(f"Train R² Score: {train_r2:.4f}")
        print(f"Test R² Score:  {test_r2:.4f}")
        print(f"Train MAE:      {train_mae:.4f}")
        print(f"Test MAE:       {test_mae:.4f}")
        print(f"Train RMSE:     {train_rmse:.4f}")
        print(f"Test RMSE:      {test_rmse:.4f}")
        
        # Cross-validation score
        print("\nPerforming 5-fold cross-validation...")
        cv_scores = cross_val_score(
            self.model, X_scaled, y, cv=5, scoring='r2', n_jobs=-1
        )
        print(f"Cross-validation R² scores: {cv_scores}")
        print(f"Mean CV R²: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
        
        # Feature importance
        print("\nTop 10 Important Features:")
        feature_importance = pd.DataFrame({
            "feature": all_features,
            "importance": self.model.feature_importances_
        }).sort_values("importance", ascending=False)
        
        for idx, row in feature_importance.head(10).iterrows():
            print(f"  {row['feature']}: {row['importance']:.4f}")
        
        return {
            "train_r2": train_r2,
            "test_r2": test_r2,
            "train_mae": train_mae,
            "test_mae": test_mae,
            "train_rmse": train_rmse,
            "test_rmse": test_rmse,
            "cv_r2_mean": cv_scores.mean(),
            "cv_r2_std": cv_scores.std(),
        }
    
    def predict(self, features_dict):
        """Predict water potential score from feature dict."""
        if self.model is None:
            raise RuntimeError("Model not trained yet")

        if "year" not in features_dict:
            features_dict = {**features_dict, "year": 2024}
        
        # Create a DataFrame to use engineer_features
        df_input = pd.DataFrame([features_dict])
        df_input = self.engineer_features(df_input)
        
        # Get all features (base + derived)
        all_features = self.feature_names + self.derived_features
        features_array = df_input[all_features].values
        
        # Scale using the scaler
        if self.scaler is not None:
            features_array = self.scaler.transform(features_array)
        
        prediction = self.model.predict(features_array)[0]
        
        # Clamp to 0-100 range
        return int(np.clip(prediction, 0, 100))
    
    def save(self, filepath="models/water_potential_model.pkl"):
        """Save model to disk."""
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(
            {
                "model": self.model,
                "feature_names": self.feature_names,
                "derived_features": self.derived_features,
                "scaler": self.scaler,
                "scaler_params": self.scaler_params,
                "r2_score": self.r2_score,
                "training_samples": self.training_samples,
                "version": self.model_version,
            },
            filepath,
        )
        print(f"Model saved to {filepath}")
    
    @staticmethod
    def load(filepath="models/water_potential_model.pkl"):
        """Load model from disk."""
        data = joblib.load(filepath)
        model_obj = WaterPotentialModel()
        model_obj.model = data["model"]
        model_obj.feature_names = data["feature_names"]
        model_obj.derived_features = data.get("derived_features", model_obj.derived_features)
        model_obj.scaler = data.get("scaler", None)
        model_obj.scaler_params = data["scaler_params"]
        model_obj.r2_score = data["r2_score"]
        model_obj.training_samples = data.get("training_samples", 0)
        model_obj.model_version = data.get("version", "1.0")
        return model_obj


if __name__ == "__main__":
    # Generate dataset
    df = generate_dataset(n_samples_per_ward=50)
    
    # Train model
    model = WaterPotentialModel()
    metrics = model.train(df)
    
    # Save model
    model.save()
    
    # Test prediction
    print("\n\nTest Prediction:")
    test_features = {
        "year": 2024,
        "rainfall_mm": 650,
        "population_density": 8000,
        "elevation_m": 900,
        "groundwater_depth_m": 25,
        "urban_area_percent": 60,
        "vegetation_percent": 40,
        "road_density_km_per_sq_km": 8,
        "water_source_proximity_km": 3,
    }
    prediction = model.predict(test_features)
    print(f"Predicted water potential: {prediction}")
