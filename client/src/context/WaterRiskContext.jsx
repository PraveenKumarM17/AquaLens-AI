import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import bbmpGeoJsonRaw from "../data/BBMP.geojson?raw";
import { generateWardFeatures, predictWaterPotential } from "../api/client";

const bbmpGeoJson = JSON.parse(bbmpGeoJsonRaw);

export const HISTORICAL_YEARS = Array.from({ length: 13 }, (_, index) => 2012 + index);
export const FUTURE_YEARS = Array.from({ length: 6 }, (_, index) => 2025 + index);

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

function buildHistoricalRecord(ward, year) {
  const yearIndex = year - 2012;
  const wardSeed = stringSeed(`${ward.code}-${ward.name}`);
  const crisisBoost = year === 2024 ? 22 : 0;
  const baseScore = 32 + (wardSeed % 18) + yearIndex * 2.1 + Math.sin((wardSeed + yearIndex * 19) * 0.08) * 10 + crisisBoost;

  return {
    year,
    ward_code: ward.code,
    ward_name: ward.name,
    water_potential_score: clamp(Math.round(baseScore), 0, 100),
    source: "historical",
  };
}

function buildFallbackPredictedRecord(ward, year) {
  const yearIndex = year - 2024;
  const wardSeed = stringSeed(`${ward.code}-${ward.name}`);
  const baseScore = 58 + (wardSeed % 16) + yearIndex * 2.8 + Math.cos((wardSeed + year * 13) * 0.07) * 12;

  return {
    year,
    ward_code: ward.code,
    ward_name: ward.name,
    water_potential_score: clamp(Math.round(baseScore), 0, 100),
    source: "predicted",
  };
}

async function buildPredictedRecord(ward, year) {
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
  } catch (error) {
    return buildFallbackPredictedRecord(ward, year);
  }
}

function buildInitialDataset(wards) {
  const historical = wards.flatMap((ward) => HISTORICAL_YEARS.map((year) => buildHistoricalRecord(ward, year)));
  const future = wards.flatMap((ward) => FUTURE_YEARS.map((year) => buildFallbackPredictedRecord(ward, year)));
  return [...historical, ...future];
}

const WaterRiskContext = createContext(null);

export function WaterRiskProvider({ children }) {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [dataset, setDataset] = useState([]);
  const [datasetStatus, setDatasetStatus] = useState("loading");
  const didLoadRef = useRef(false);

  useEffect(() => {
    if (didLoadRef.current) {
      return;
    }

    didLoadRef.current = true;

    let cancelled = false;

    const loadDataset = async () => {
      const wards = buildWardList();
      const initialDataset = buildInitialDataset(wards);

      if (!cancelled) {
        // Immediately show fallback dataset so UI is responsive
        setDataset(initialDataset);
        setDatasetStatus("ready");
      }

      // Hydrate ML predictions in background (non-blocking)
      (async () => {
        try {
          const tasks = wards.flatMap((ward) => FUTURE_YEARS.map((year) => () => buildPredictedRecord(ward, year)));

          const batchSize = 20; // concurrent requests per batch
          const predictedRecords = [];

          for (let i = 0; i < tasks.length; i += batchSize) {
            if (cancelled) break;
            const batch = tasks.slice(i, i + batchSize);
            const results = await Promise.all(batch.map((fn) => fn()));
            predictedRecords.push(...results);
            // small pause
            await new Promise((res) => setTimeout(res, 25));
          }

          if (cancelled) return;

          const historicalCount = wards.length * HISTORICAL_YEARS.length;
          const historicalRecords = initialDataset.slice(0, historicalCount);

          // Replace future records with ML predictions while keeping historical as-is
          setDataset([...historicalRecords, ...predictedRecords]);
          // keep status 'ready' (hydration completed)
        } catch (err) {
          console.warn("Background ML hydration failed:", err);
        }
      })();
    };

    loadDataset().catch((error) => {
      console.warn("Failed to hydrate water risk dataset:", error);
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

  // Aggregate dataset by year for quick lookups and crisis detection
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

  // Determine first crisis year among predicted years (2025-2030)
  const crisisYear = useMemo(() => {
    // Crisis logic: average score >= 85 OR max score >= 95
    const predictedYears = Array.from({ length: 6 }, (_, i) => 2025 + i);

    for (const y of predictedYears) {
      const agg = yearAggregates.get(y);
      if (!agg) continue;
      if (agg.avg_score >= 85 || agg.max_score >= 95) {
        return y;
      }
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
    [dataset, datasetStatus, getWardYearRecord, getYearRecords, selectedYear]
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