/**
 * API client for AquaLens ML backend
 * Handles predictions and model information
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Predict water potential for a ward based on its characteristics
 */
export async function predictWaterPotential(wardFeatures) {
  try {
    const response = await fetch(`${API_BASE_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wardFeatures),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Prediction failed:', error);
    throw error;
  }
}

/**
 * Get model information and performance metrics
 */
export async function getModelInfo() {
  try {
    const response = await fetch(`${API_BASE_URL}/model-info`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch model info:', error);
    throw error;
  }
}

/**
 * Check API health
 */
export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      return { status: 'unhealthy' };
    }

    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    return { status: 'unavailable' };
  }
}

/**
 * Get list of all Bengaluru wards
 */
export async function getBengaluruWards() {
  try {
    const response = await fetch(`${API_BASE_URL}/wards`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch wards:', error);
    throw error;
  }
}

/**
 * Get risk score categories and color mappings
 */
export async function getRiskCategories() {
  try {
    const response = await fetch(`${API_BASE_URL}/categories`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    throw error;
  }
}

/**
 * Generate realistic features for a ward (for testing)
 * In production, these come from data sources
 */
export function generateWardFeatures(wardCode, wardName, year = 2024) {
  // Deterministic feature generation based on ward code and year
  const seed = wardCode.charCodeAt(1) * 7 + wardCode.charCodeAt(2) * 13 + year * 17;
  const random = (min, max, offset = 0) => {
    const x = Math.sin(seed + offset) * 10000;
    return min + ((x - Math.floor(x)) * (max - min));
  };

  return {
    ward_code: wardCode,
    year,
    rainfall_mm: random(500, 800),
    population_density: random(3000, 12000, 1),
    elevation_m: random(870, 920, 2),
    groundwater_depth_m: random(15, 40, 3),
    urban_area_percent: random(30, 90, 4),
    vegetation_percent: random(10, 70, 5),
    road_density_km_per_sq_km: random(4, 12, 6),
    water_source_proximity_km: random(1, 8, 7),
  };
}
