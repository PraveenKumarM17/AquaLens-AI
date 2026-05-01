import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import bbmpGeoJsonRaw from "../data/BBMP.geojson?raw";
import { generateWardFeatures, predictWaterPotential } from "../api/client";

const bbmpGeoJson = JSON.parse(bbmpGeoJsonRaw);

export const HISTORICAL_YEARS = Array.from({ length: 13 }, (_, index) => 2012 + index);
export const FUTURE_YEARS = Array.from({ length: 6 }, (_, index) => 2025 + index);

// 2025 and 2026 are recovery years after the 2024 crisis — do not flag them as crisis
const CRISIS_SCAN_START_YEAR = 2027;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function stringSeed(input) {
  return Array.from(input).reduce((seed, character) => seed + character.charCodeAt(0), 0);
}

export function scoreToCategory(score) {
  if (score >= 95) return "Critical";
  if (score >= 85) return "High";
  if (score >= 70) return "Medium-High";
  if (score >= 50) return "Medium";
  if (score >= 30) return "Low-Medium";
  return "Safe";
}

export function scoreToColor(score) {
  if (score >= 95) return "#b91c1c";
  if (score >= 85) return "#ef4444";
  if (score >= 70) return "#f97316";
  if (score >= 50) return "#eab308";
  if (score >= 30) return "#22c55e";
  return "#84cc16";
}

export function scoreToTimeRemaining(score) {
  if (score >= 95) return "0-2 months";
  if (score >= 85) return "2-4 months";
  if (score >= 70) return "4-6 months";
  if (score >= 50) return "6-9 months";
  if (score >= 30) return "9-12 months";
  return ">12 months";
}

function buildWardList() {
  return bbmpGeoJson.features.map((feature) => ({
    code: feature.properties.KGISWardCode,
    name: feature.properties.KGISWardName,
    number: Number(feature.properties.KGISWardNo) || 0,
    lat: Number(feature.geometry?.coordinates?.[0]?.[0]?.[1]) || 0,
    lon: Number(feature.geometry?.coordinates?.[0]?.[0]?.[0]) || 0,
  }));
}

/**
 * Historical record: seed-based, stable across renders.
 * 2024 gets a crisis boost (+22) to reflect the observed peak.
 */
function buildHistoricalRecord(ward, year) {
  const yearIndex = year - 2012;
  const wardSeed = stringSeed(`${ward.code}-${ward.name}`);
  const crisisBoost = year === 2024 ? 22 : 0;
  const baseScore =
    32 +
    (wardSeed % 18) +
    yearIndex * 2.1 +
    Math.sin((wardSeed + yearIndex * 19) * 0.08) * 10 +
    crisisBoost;

  return {
    year,
    ward_code: ward.code,
    ward_name: ward.name,
    water_potential_score: clamp(Math.round(baseScore), 0, 100),
    source: "historical",
  };
}

/**
 * Fallback predicted record used while ML hydration is in-flight or on API error.
 * 2025 and 2026 are post-crisis recovery years — scores step down from the 2024 peak.
 * 2027+ can drift upward again if the model sees pressure building.
 */
function buildFallbackPredictedRecord(ward, year, historical2024Score) {
  const wardSeed = stringSeed(`${ward.code}-${ward.name}`);

  // Recovery modifier: 2025 and 2026 are lower than 2024 (crisis resolved)
  let recoveryOffset = 0;
  if (year === 2025) recoveryOffset = -18;
  else if (year === 2026) recoveryOffset = -12;

  const yearIndex = year - 2024;
  const baseScore =
    historical2024Score +
    recoveryOffset +
    yearIndex * 1.5 +
    Math.cos((wardSeed + year * 13) * 0.07) * 8;

  return {
    year,
    ward_code: ward.code,
    ward_name: ward.name,
    water_potential_score: clamp(Math.round(baseScore), 0, 100),
    source: "predicted_fallback",
  };
}

/**
 * Fetch a predicted record for one ward+year from the ML API.
 * Falls back to the seed-based record on any error.
 */
async function buildPredictedRecord(ward, year, historical2024Score) {
  try {
    const features = generateWardFeatures(ward.code, ward.name, year);
    const result = await predictWaterPotential(features);

    return {
      year,
      ward_code: ward.code,
      ward_name: ward.name,
      water_potential_score: result.predicted_score,
      source: "predicted",
    };
  } catch {
    // Fixed: correct argument order (ward, year, historical2024Score)
    return buildFallbackPredictedRecord(ward, year, historical2024Score);
  }
}

function buildInitialDataset(wards) {
  const historical = wards.flatMap((ward) =>
    HISTORICAL_YEARS.map((year) => buildHistoricalRecord(ward, year))
  );
  // Fallback futures anchored to each ward's 2024 historical score
  const future = wards.flatMap((ward) => {
    const hist2024 = buildHistoricalRecord(ward, 2024);
    return FUTURE_YEARS.map((year) =>
      buildFallbackPredictedRecord(ward, year, hist2024.water_potential_score)
    );
  });
  return [...historical, ...future];
}

const WaterRiskContext = createContext(null);

export function WaterRiskProvider({ children }) {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [dataset, setDataset] = useState([]);
  const [datasetStatus, setDatasetStatus] = useState("loading");
  const didLoadRef = useRef(false);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    let cancelled = false;

    const loadDataset = async () => {
      const wards = buildWardList();
      const initialDataset = buildInitialDataset(wards);

      if (!cancelled) {
        setDataset(initialDataset);
        setDatasetStatus("ready");
      }

      // Background ML hydration: replace fallback future records with real predictions
      (async () => {
        try {
          const hist2024Map = new Map(
            wards.map((ward) => [ward.code, buildHistoricalRecord(ward, 2024).water_potential_score])
          );

          const tasks = wards.flatMap((ward) =>
            FUTURE_YEARS.map((year) => () =>
              buildPredictedRecord(ward, year, hist2024Map.get(ward.code) ?? 60)
            )
          );

          const batchSize = 10;
          const predictedRecords = [];

          for (let i = 0; i < tasks.length; i += batchSize) {
            if (cancelled) break;
            const batch = tasks.slice(i, i + batchSize);
            const results = await Promise.all(batch.map((fn) => fn()));
            predictedRecords.push(...results);
            await new Promise((res) => setTimeout(res, 30));
          }

          if (cancelled) return;

          const historicalCount = wards.length * HISTORICAL_YEARS.length;
          const historicalRecords = initialDataset.slice(0, historicalCount);

          setDataset([...historicalRecords, ...predictedRecords]);
        } catch (err) {
          console.warn("Background ML hydration failed:", err);
        }
      })();
    };

    loadDataset().catch((error) => {
      console.warn("Failed to load water risk dataset:", error);
      if (!cancelled) {
        setDataset(buildInitialDataset(buildWardList()));
        setDatasetStatus("fallback");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const recordsByKey = useMemo(() => {
    const index = new Map();
    dataset.forEach((record) => {
      index.set(`${record.year}:${record.ward_code}`, record);
    });
    return index;
  }, [dataset]);

  const yearAggregates = useMemo(() => {
    const map = new Map();
    if (!dataset || dataset.length === 0) return map;

    const byYear = dataset.reduce((acc, rec) => {
      acc[rec.year] = acc[rec.year] || [];
      acc[rec.year].push(rec);
      return acc;
    }, {});

    Object.keys(byYear).forEach((y) => {
      const year = Number(y);
      const records = byYear[year];
      const avg = records.reduce((s, r) => s + r.water_potential_score, 0) / records.length;
      const max = records.reduce((m, r) => Math.max(m, r.water_potential_score), -Infinity);
      const min = records.reduce((m, r) => Math.min(m, r.water_potential_score), Infinity);

      map.set(year, {
        year,
        avg_score: Math.round(avg),
        max_score: Math.round(max),
        min_score: Math.round(min),
        count: records.length,
      });
    });

    return map;
  }, [dataset]);

  /**
   * Crisis year: first future year (≥ 2027) where avg ≥ 85 OR max ≥ 95.
   * 2025 and 2026 are excluded — they are post-2024-crisis recovery years.
   */
  const crisisYear = useMemo(() => {
    for (const y of FUTURE_YEARS) {
      if (y < CRISIS_SCAN_START_YEAR) continue; // skip recovery years
      const agg = yearAggregates.get(y);
      if (!agg) continue;
      if (agg.avg_score >= 85 || agg.max_score >= 95) return y;
    }
    return null;
  }, [yearAggregates]);

  const getWardYearRecord = useCallback(
    (wardCode, year) => recordsByKey.get(`${year}:${wardCode}`) ?? null,
    [recordsByKey]
  );

  const getYearRecords = useCallback(
    (year) => dataset.filter((record) => record.year === year),
    [dataset]
  );

  const value = useMemo(
    () => ({
      selectedYear,
      setSelectedYear,
      dataset,
      datasetStatus,
      isDatasetLoading: datasetStatus === "loading" || datasetStatus === "hydrating",
      getWardYearRecord,
      getYearRecords,
      yearAggregates,
      crisisYear,
    }),
    [dataset, datasetStatus, getWardYearRecord, getYearRecords, selectedYear, yearAggregates, crisisYear]
  );

  return <WaterRiskContext.Provider value={value}>{children}</WaterRiskContext.Provider>;
}

export function useWaterRisk() {
  const context = useContext(WaterRiskContext);
  if (!context) {
    throw new Error("useWaterRisk must be used inside WaterRiskProvider");
  }
  return context;
}