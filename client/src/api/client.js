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
 * Year-specific scenario modifiers.
 *
 * 2024 was the crisis peak — high stress across all indicators.
 * 2025 and 2026 are post-crisis recovery years: policy interventions,
 * improved recharge, and reduced extraction lower the stress indicators.
 * 2027+ stress gradually rebuilds as population and urbanisation pressure returns.
 *
 * These modifiers are applied on top of the ward's base features so that
 * the ML model sees realistic, scenario-consistent inputs and produces
 * correspondingly lower (recovery) or higher (escalating) predicted scores.
 */
const YEAR_SCENARIO_MODIFIERS = {
  // ── Recovery years ──────────────────────────────────────────────────
  2025: {
    rainfall_bonus:         60,   // better monsoon / water harvesting
    pop_density_reduction:  800,  // migration relief + policy
    gw_depth_reduction:     8,    // shallower GW — recharge improving
    urban_reduction:        5,    // green cover initiatives
    veg_bonus:              10,   // replanting programmes
    water_prox_reduction:   1.5,  // new borewells / tanks
  },
  2026: {
    rainfall_bonus:         35,
    pop_density_reduction:  400,
    gw_depth_reduction:     4,
    urban_reduction:        3,
    veg_bonus:              6,
    water_prox_reduction:   0.8,
  },
  // ── Pressure rebuilds from 2027 ─────────────────────────────────────
  2027: {
    rainfall_bonus:         0,
    pop_density_reduction:  0,
    gw_depth_reduction:     0,
    urban_reduction:        0,
    veg_bonus:              0,
    water_prox_reduction:   0,
  },
  2028: {
    rainfall_bonus:        -15,   // drier trend returning
    pop_density_reduction: -400,  // growth pressure
    gw_depth_reduction:    -4,    // deeper GW again
    urban_reduction:       -3,
    veg_bonus:             -5,
    water_prox_reduction:   0,
  },
  2029: {
    rainfall_bonus:        -25,
    pop_density_reduction: -700,
    gw_depth_reduction:    -7,
    urban_reduction:       -5,
    veg_bonus:             -8,
    water_prox_reduction:   0,
  },
  2030: {
    rainfall_bonus:        -35,
    pop_density_reduction: -1000,
    gw_depth_reduction:    -10,
    urban_reduction:       -7,
    veg_bonus:             -12,
    water_prox_reduction:   0,
  },
};

/**
 * Generate realistic, ward-specific features for ML prediction.
 *
 * Uses a stable per-ward + per-year hash so the same ward/year always
 * produces the same feature vector (deterministic, no random drift).
 *
 * Recovery years (2025–2026) receive favourable scenario modifiers so the
 * ML model produces scores below the 2024 crisis peak. Pressure years
 * (2028–2030) receive adverse modifiers so scores escalate again.
 *
 * Feature ranges match the FastAPI FeaturesInput validators:
 *   rainfall_mm                : 400 – 900
 *   population_density         : 2000 – 15000
 *   elevation_m                : 850 – 950
 *   groundwater_depth_m        : 10 – 50
 *   urban_area_percent         : 20 – 95
 *   vegetation_percent         : 5 – 80
 *   road_density_km_per_sq_km  : 2 – 15
 *   water_source_proximity_km  : 0.5 – 10
 */
export function generateWardFeatures(wardCode, wardName, year = 2024) {
  // Build a stable integer seed from the full ward code string
  const wardSeed = Array.from(wardCode).reduce(
    (acc, ch, i) => acc + ch.charCodeAt(0) * (i + 1) * 31,
    0
  );

  // Year offset: each year shifts all features slightly to simulate change
  const yearOffset = (year - 2012) * 0.07;

  /**
   * Deterministic pseudo-random in [min, max].
   * `offset` must be a different prime multiple for each feature.
   */
  function feature(min, max, offset) {
    const raw = Math.sin(wardSeed * 0.0013 + offset + yearOffset) * 10000;
    const t = (raw - Math.floor(raw)); // [0, 1)
    return min + t * (max - min);
  }

  // Base features (ward + year deterministic)
  const baseRainfall     = feature(400, 900, 4.7);
  const basePopDensity   = feature(2000, 15000, 5.3);
  const baseGwDepth      = feature(10, 50, 3.1);
  const baseUrbanPct     = feature(20, 95, 1.7);
  const baseVegPct       = feature(5, 80, 2.3);
  const baseWaterProx    = feature(0.5, 10, 8.3);

  // Apply year-specific scenario modifiers
  const mod = YEAR_SCENARIO_MODIFIERS[year] ?? YEAR_SCENARIO_MODIFIERS[2027];

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const rainfall         = clamp(baseRainfall    + (mod.rainfall_bonus       ?? 0), 400, 900);
  const popDensity       = clamp(basePopDensity  - (mod.pop_density_reduction ?? 0), 2000, 15000);
  const gwDepth          = clamp(baseGwDepth     - (mod.gw_depth_reduction    ?? 0), 10, 50);
  const urbanPct         = clamp(baseUrbanPct    - (mod.urban_reduction       ?? 0), 20, 95);
  const vegPct           = clamp(baseVegPct      + (mod.veg_bonus             ?? 0), 5, 80);
  const waterProx        = clamp(baseWaterProx   - (mod.water_prox_reduction  ?? 0), 0.5, 10);

  return {
    ward_code:                  wardCode,
    year,
    rainfall_mm:                parseFloat(rainfall.toFixed(2)),
    population_density:         parseFloat(popDensity.toFixed(1)),
    elevation_m:                parseFloat(feature(850, 950, 6.1).toFixed(1)),
    groundwater_depth_m:        parseFloat(gwDepth.toFixed(2)),
    urban_area_percent:         parseFloat(urbanPct.toFixed(2)),
    vegetation_percent:         parseFloat(vegPct.toFixed(2)),
    road_density_km_per_sq_km:  parseFloat(feature(2, 15, 7.9).toFixed(2)),
    water_source_proximity_km:  parseFloat(waterProx.toFixed(2)),
  };
}