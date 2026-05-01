import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Droplets,
  CalendarDays,
  MapPin,
  BrainCircuit,
  Info,
} from "lucide-react";

import RiskTable from "../components/RiskTable";
import BengaluruMap from "../components/BengaluruMap";
import { predictWaterPotential, generateWardFeatures, checkApiHealth, getModelInfo } from "../api/client";
import { useWaterRisk } from "../context/WaterRiskContext";

// Years where crisis alerts should never fire (post-2024 recovery)
const CRISIS_ALERT_EXEMPT_YEARS = new Set([2025, 2026]);

const initialYearlyData = [
  { year: 2012, value: 30 },
  { year: 2014, value: 50 },
  { year: 2016, value: 60 },
  { year: 2018, value: 85 },
  { year: 2020, value: 60 },
  { year: 2022, value: 40 },
  { year: 2024, value: 95 },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function stringSeed(input) {
  return Array.from(input).reduce((seed, character) => seed + character.charCodeAt(0), 0);
}

/**
 * Build yearly chart data.
 * Historical points (2012–2024) are fixed.
 * Predicted points (2025–2030) are derived from ML predictions fetched
 * per-year; fallback to a seed-based estimate when predictions are absent.
 */
function buildYearlyData(wardSeed, mlByYear = null) {
  const historicalData = initialYearlyData.map((point) => ({
    year: point.year,
    value: point.value,
    type: "historical",
  }));

  const predictedYears = [2025, 2026, 2027, 2028, 2029, 2030];
  const historical2024 = historicalData.find((p) => p.year === 2024)?.value ?? 95;
  const bridge2024 = mlByYear?.get(2024) ?? historical2024;

  // Recovery offsets: 2025 and 2026 must be meaningfully below the 2024 crisis peak.
  // 2027+ can escalate again as pressure rebuilds.
  const recoveryOffsets = {
    2025: -25,
    2026: -15,
    2027: 0,
    2028: 5,
    2029: 10,
    2030: 15,
  };

  const predictedData = [
    { year: 2024, value: Math.round(bridge2024), type: "predicted" },
    ...predictedYears.map((year, index) => {
      if (mlByYear?.has(year)) {
        return { year, value: Math.round(mlByYear.get(year)), type: "predicted" };
      }
      // Fallback: anchor at 2024, apply recovery/escalation offset + small ward variation
      const offset = recoveryOffsets[year] ?? 0;
      const wardVariation = Math.sin(wardSeed * 0.17 + (7 + index) * 0.9) * 5;
      const fallback = clamp(Math.round(bridge2024 + offset + wardVariation), 0, 100);
      return { year, value: fallback, type: "predicted" };
    }),
  ];

  return [...historicalData, ...predictedData];
}

function getYearlyChartValue(point, seriesType) {
  if (point.type !== seriesType) return null;
  return point.value;
}

function getHistoricalTooltipValue(payload) {
  return payload?.value;
}

/**
 * Build monthly chart data from an ML baseline score.
 */
function buildMonthlyData(mlBaseline) {
  const seasonalOffsets = [
    -20, -15, -10, -5, 5, 15, 22, 18, 12, 8, -5, -14,
  ];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return months.map((month, index) => ({
    month,
    value: clamp(Math.round(mlBaseline + seasonalOffsets[index]), 0, 100),
  }));
}

export default function Dashboard() {
  const [selectedWard, setSelectedWard] = useState(null);
  const [highRiskWard, setHighRiskWard] = useState(null);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const [mlByYear, setMlByYear] = useState(null);
  const [mlPrediction, setMlPrediction] = useState(null);
  const [fetchingPrediction, setFetchingPrediction] = useState(false);

  const [modelStatus, setModelStatus] = useState({ status: 'unknown', model_loaded: false });
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);

  const { selectedYear, setSelectedYear, getWardYearRecord, getYearRecords, yearAggregates, crisisYear } = useWaterRisk();

  const selectedWardLabel = selectedWard?.name ?? "Select a ward";
  const selectedWardSeed = stringSeed(selectedWard?.code ?? selectedWardLabel);

  const [yearlyData, setYearlyData] = useState(() => buildYearlyData(selectedWardSeed, null));
  const [monthlyData, setMonthlyData] = useState(() => buildMonthlyData(50));

  const fetchControllerRef = useRef(null);

  useEffect(() => {
    if (!selectedWard) {
      setMlPrediction(null);
      setMlByYear(null);
      return;
    }

    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort = true;
    }
    const ctrl = { abort: false };
    fetchControllerRef.current = ctrl;

    setFetchingPrediction(true);

    const yearsToFetch = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

    const fetchAll = async () => {
      try {
        const results = await Promise.allSettled(
          yearsToFetch.map(async (year) => {
            const features = generateWardFeatures(selectedWard.code, selectedWard.name, year);
            const result = await predictWaterPotential(features);
            return { year, score: result.predicted_score };
          })
        );

        if (ctrl.abort) return;

        const map = new Map();
        results.forEach((r) => {
          if (r.status === "fulfilled") {
            map.set(r.value.year, r.value.score);
          }
        });

        setMlByYear(map);
        setMlPrediction(map.get(2024) ?? null);
      } catch (err) {
        if (!ctrl.abort) {
          console.warn("Failed to fetch ML predictions:", err);
          setMlByYear(null);
          setMlPrediction(null);
        }
      } finally {
        if (!ctrl.abort) setFetchingPrediction(false);
      }
    };

    fetchAll();

    return () => {
      ctrl.abort = true;
    };
  }, [selectedWard]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setModelLoading(true);
        const health = await checkApiHealth();
        if (!mounted) return;
        setModelStatus(health);
        if (health.model_loaded) {
          try {
            const info = await getModelInfo();
            if (!mounted) return;
            setModelInfo(info);
          } catch (err) {
            console.warn('Failed to get model info', err);
          }
        }
      } catch (err) {
        console.warn('Model status check failed', err);
      } finally {
        if (mounted) setModelLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setYearlyData(buildYearlyData(selectedWardSeed, mlByYear));
    const baseline = mlByYear?.get(selectedYear) ?? mlPrediction ?? 50;
    setMonthlyData(buildMonthlyData(baseline));
  }, [selectedWardSeed, mlByYear, mlPrediction, selectedYear]);

  const monthlyExtremes = useMemo(() => {
    const maxPoint = monthlyData.reduce((max, current) => (current.value > max.value ? current : max), monthlyData[0]);
    const minPoint = monthlyData.reduce((min, current) => (current.value < min.value ? current : min), monthlyData[0]);
    return { maxPoint, minPoint };
  }, [monthlyData]);

  const selectedWardYearRecord = useMemo(() => {
    if (!selectedWard) return null;
    return getWardYearRecord(selectedWard.code, selectedYear);
  }, [getWardYearRecord, selectedWard, selectedYear]);

  const selectedYearRecords = useMemo(() => getYearRecords(selectedYear), [getYearRecords, selectedYear]);

  const currentRiskScore = useMemo(() => {
    if (selectedWardYearRecord) {
      return selectedWardYearRecord.water_potential_score;
    }
    if (mlByYear?.has(selectedYear)) {
      return mlByYear.get(selectedYear);
    }
    if (selectedYearRecords.length > 0) {
      const avg = selectedYearRecords.reduce((sum, point) => sum + point.water_potential_score, 0) / selectedYearRecords.length;
      return Math.round(avg);
    }
    if (mlPrediction !== null) {
      return mlPrediction;
    }
    const avg = yearlyData.reduce((sum, point) => sum + point.value, 0) / yearlyData.length;
    return Math.round(avg);
  }, [yearlyData, mlPrediction, mlByYear, selectedWardYearRecord, selectedYearRecords, selectedYear]);

  const handleYearSelect = (year) => {
    setSelectedYear(year);
  };

  const [showCrisisModal, setShowCrisisModal] = useState(false);

  useEffect(() => {
    // Crisis modal only fires for 2027+ — 2025 and 2026 are recovery years
    if (selectedYear >= 2027 && selectedYear <= 2030) {
      const agg = yearAggregates?.get(selectedYear);
      if (agg && (agg.avg_score >= 85 || agg.max_score >= 95)) {
        setShowCrisisModal(true);
      } else {
        setShowCrisisModal(false);
      }
    } else {
      setShowCrisisModal(false);
    }
  }, [selectedYear, yearAggregates]);

  const renderYearDot = (pointProps, color) => {
    const { cx, cy, payload } = pointProps;
    const isSelected = payload?.year === selectedYear;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 7.5 : 4.2}
        fill={isSelected ? "#ffffff" : color}
        stroke={isSelected ? color : "#dbeafe"}
        strokeWidth={isSelected ? 3 : 1.2}
        style={{ cursor: "pointer" }}
        onClick={() => handleYearSelect(payload.year)}
      />
    );
  };

  useEffect(() => {
    setAlertDismissed(false);
  }, [highRiskWard?.code, selectedYear, selectedWard?.code]);

  const isFutureYear = selectedYear >= 2025 && selectedYear <= 2030;

  const activeAlertWard = (() => {
    if (selectedWard) {
      const wardRecord = getWardYearRecord(selectedWard.code, selectedYear);
      if (wardRecord && wardRecord.water_potential_score >= 85) {
        return { ...selectedWard, score: wardRecord.water_potential_score };
      }
      return highRiskWard;
    }
    return highRiskWard;
  })();

  // Alert suppressed for 2025 and 2026 (recovery years after 2024 crisis)
  const showAlert = Boolean(
    isFutureYear &&
    !CRISIS_ALERT_EXEMPT_YEARS.has(selectedYear) &&
    activeAlertWard &&
    activeAlertWard.score >= 85 &&
    !alertDismissed
  );

  /**
   * Get the display score for a predicted year button.
   * Priority: ML prediction for selected ward → context dataset record → yearlyData point → "—"
   */
  const getPredictedYearScore = (yr) => {
    // If a ward is selected and we have ML predictions for it, use those
    if (selectedWard && mlByYear?.has(yr)) {
      return mlByYear.get(yr);
    }
    // Otherwise use the ward+year record from the context dataset (ML-backed after hydration)
    if (selectedWard) {
      const record = getWardYearRecord(selectedWard.code, yr);
      if (record) return record.water_potential_score;
    }
    // No ward selected: use the yearly chart data (seed-based fallback)
    const point = yearlyData.find((p) => p.year === yr);
    return point ? point.value : null;
  };

  return (
    <div className="min-h-screen bg-[#020817] px-3 py-4 text-white md:px-5 lg:px-6">
      <div className="mx-auto max-w-[1480px] space-y-4">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-24 top-[-60px] h-[320px] w-[320px] rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute right-[-100px] top-[160px] h-[360px] w-[360px] rounded-full bg-blue-600/10 blur-3xl" />
          <div className="absolute bottom-[-140px] left-1/3 h-[300px] w-[300px] rounded-full bg-orange-500/10 blur-3xl" />
        </div>

        <header className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-cyan-500/30 bg-[#07172c]/70 p-4 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="rounded-xl border border-cyan-400/50 bg-cyan-500/10 p-2 text-cyan-300">
                <Droplets size={28} />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-wide text-cyan-300">AQUALENS-AI</h1>
                <p className="text-sm text-cyan-100/85">
                  Night-time Light Intelligence for Underground Water Detection
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-blue-400/25 bg-[#06132b]/90 px-4 py-3">
              <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-blue-200/75">
                <CalendarDays size={16} /> Data Range
              </p>
              <p className="text-lg font-semibold">2012 - 2025</p>
            </div>

            <div className="rounded-2xl border border-blue-400/25 bg-[#06132b]/90 px-4 py-3">
              <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-blue-200/75">
                <MapPin size={16} /> Location
              </p>
              <p className="text-lg font-semibold">Bengaluru, India</p>
            </div>

            <div className="rounded-2xl border border-blue-400/25 bg-[#06132b]/90 px-4 py-3">
              <p className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-blue-200/75">
                <BrainCircuit size={16} /> Model
              </p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">AQUALENS-AI v1.0</p>
                {modelLoading ? (
                  <div className="ml-2 flex items-center gap-2 text-sm text-blue-200/70">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    <div>Checking model...</div>
                  </div>
                ) : modelStatus?.model_loaded ? (
                  <div className="ml-2 text-sm text-emerald-300">
                    ✓ Model loaded
                    {modelInfo?.r2_score && (
                      <span className="ml-2 text-xs text-cyan-200">R²: {modelInfo.r2_score}</span>
                    )}
                  </div>
                ) : (
                  <div className="ml-2 text-sm text-rose-300">Model unavailable</div>
                )}
              </div>
            </div>
          </div>
        </header>

        {showAlert && (
          <div className="rounded-xl border border-rose-400/50 bg-rose-700/90 p-3 text-white shadow-lg">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="text-sm font-extrabold uppercase tracking-wide">Automatic Alert</p>
                <p className="text-sm">
                  {activeAlertWard.name} (Ward {activeAlertWard.number ?? "N/A"}) is projected to be in a HIGH risk zone in {selectedYear} with predicted score {activeAlertWard.score}.
                </p>
                {
                  (() => {
                    const crisisRecord = activeAlertWard?.code ? getWardYearRecord(activeAlertWard.code, 2024) : null;
                    const crisisScore = crisisRecord ? crisisRecord.water_potential_score : null;
                    return (
                      <p className="text-xs text-rose-100/90">
                        {crisisScore !== null
                          ? `Latest observed score (2024): ${crisisScore}.`
                          : `Latest observed score (2024): data not available.`}
                      </p>
                    );
                  })()
                }
                <p className="text-xs text-rose-100/90">This alert is shown for future projections (2027 - 2030).</p>
              </div>

              <button
                type="button"
                onClick={() => setAlertDismissed(true)}
                className="w-full shrink-0 self-stretch rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 sm:w-auto sm:self-start"
              >
                Acknowledge
              </button>
            </div>
          </div>
        )}

        <main className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-blue-500/30 bg-[#061327]/80 p-4 shadow-[0_0_0_1px_rgba(30,64,175,0.2),0_30px_80px_rgba(2,6,23,0.7)] backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold uppercase tracking-wide text-blue-100">Underground Water Potential Trend</h2>
              <Info className="text-blue-300/80" size={16} />
            </div>

            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <button className="rounded-md border border-blue-500/50 bg-blue-500/20 px-3 py-1.5">{selectedWardLabel}</button>
              <span className="rounded-md border border-blue-500/35 px-3 py-1.5 text-blue-100/90">Low (0 - 30)</span>
              <span className="rounded-md border border-orange-400/45 px-3 py-1.5 text-orange-200">Medium (30 - 70)</span>
              <span className="rounded-md border border-red-500/45 px-3 py-1.5 text-red-200">High (70 - 100)</span>
              {mlByYear !== null && (
                <span className="rounded-md border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-200">
                  📈 ML Predicted (2025+)
                </span>
              )}
            </div>

            <div className="mb-4 h-[280px] rounded-xl border border-blue-500/20 bg-[#031025]/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-blue-100/70">
                  Yearly Trend Overview (2012 - 2030)
                  {mlByYear !== null && <span className="ml-2 text-xs text-cyan-300">✓ ML Powered</span>}
                </p>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                    Selected {selectedYear}
                  </span>
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                    2024 Crisis Peak
                  </span>
                  {fetchingPrediction && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                  )}
                </div>
              </div>
              {showCrisisModal && (
                <div className="fixed left-1/2 top-12 z-50 w-[360px] -translate-x-1/2 transform rounded-lg border border-rose-400/50 bg-rose-800/95 p-4 text-white shadow-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-bold">⚠️ Water Crisis Expected in {selectedYear}</div>
                      <div className="text-sm mt-1">High risk detected across multiple wards — immediate action recommended.</div>
                      {crisisYear && (
                        <div className="text-xs mt-2 text-rose-100/80">Model projects next crisis from {crisisYear}</div>
                      )}
                    </div>
                    <div>
                      <button onClick={() => setShowCrisisModal(false)} className="rounded bg-white/10 px-3 py-1 text-sm">Dismiss</button>
                    </div>
                  </div>
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearlyData} margin={{ top: 20, right: 18, left: 6, bottom: 8 }}>
                  <XAxis
                    dataKey="year"
                    type="number"
                    domain={[2012, 2030]}
                    ticks={[2012, 2014, 2016, 2018, 2020, 2022, 2024, 2025, 2026, 2027, 2028, 2029, 2030]}
                    axisLine={{ stroke: "#1f3b67" }}
                    tickLine={false}
                    tickMargin={10}
                    tick={{ fill: "#9bbadf", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={{ stroke: "#1f3b67" }}
                    tickLine={false}
                    domain={[0, 100]}
                    width={34}
                    tickMargin={8}
                    tick={{ fill: "#9bbadf", fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ stroke: "#60a5fa", strokeDasharray: "6 6" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #2563eb",
                      background: "#0b1730",
                      color: "#e2e8f0",
                    }}
                    formatter={(value, name, props) => {
                      const label = props.payload.type === "historical" ? "Historical Data" : "ML Predicted";
                      const displayValue = getHistoricalTooltipValue(props.payload) ?? value;
                      return [displayValue, label];
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    iconType="circle"
                    wrapperStyle={{ color: "#dbeafe", fontSize: "12px", paddingTop: "8px" }}
                  />
                  <ReferenceLine
                    x={selectedYear}
                    stroke="#666"
                    strokeDasharray="5 5"
                    strokeOpacity={0.9}
                  />
                  {/* Mark 2024 as the crisis peak */}
                  <ReferenceLine
                    x={2024}
                    stroke="#ff4d4f"
                    strokeWidth={2}
                    label={{ value: 'Crisis Peak', position: 'insideTopRight', fill: '#ff7a7a', fontSize: 10 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={(point) => getYearlyChartValue(point, "historical")}
                    stroke="#2f8cff"
                    strokeWidth={2.75}
                    dot={(pointProps) => renderYearDot(pointProps, "#2f8cff")}
                    name="Historical Data"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={(point) => getYearlyChartValue(point, "predicted")}
                    stroke="#06b6d4"
                    strokeWidth={2.75}
                    strokeDasharray="7 5"
                    dot={(pointProps) => renderYearDot(pointProps, "#06b6d4")}
                    name="ML Predicted Data"
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {selectedWard ? (
              <>
                <div className="mb-4 h-[170px] rounded-xl border border-blue-500/20 bg-[#031025]/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm text-blue-100/90">
                      Monthly Trend for {selectedWardLabel} - {selectedYear}
                      {mlByYear !== null && <span className="ml-2 text-xs text-cyan-300">✓ ML Prediction</span>}
                    </p>
                    {fetchingPrediction && (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="month"
                        axisLine={{ stroke: "#1f3b67" }}
                        tickLine={false}
                        tick={{ fill: "#9bbadf", fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={{ stroke: "#1f3b67" }}
                        tickLine={false}
                        domain={[0, 100]}
                        tick={{ fill: "#9bbadf", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "12px",
                          border: "1px solid #2563eb",
                          background: "#0b1730",
                          color: "#e2e8f0",
                        }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#1d8bff" strokeWidth={3} dot={{ r: 3, fill: "#1d8bff" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="mb-4 rounded-xl border border-blue-500/20 bg-[#051733]/70 p-3 text-sm text-blue-100/85">
                  <span className="font-semibold text-cyan-300">Insight:</span> {selectedWardLabel} currently peaks in {monthlyExtremes.maxPoint.month} ({monthlyExtremes.maxPoint.value}) and is lowest in {monthlyExtremes.minPoint.month} ({monthlyExtremes.minPoint.value}).
                </div>
              </>
            ) : (
              <div className="mb-4 rounded-xl border border-blue-500/20 bg-[#051733]/70 p-6 text-center">
                <p className="text-blue-200/70">Select a region on the map to view monthly trend analysis</p>
              </div>
            )}

            <div className="mb-4 space-y-2">
              <div className="rounded-xl border border-blue-500/20 bg-[#051733]/70 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-100/80 uppercase">Historical Data (2012 - 2024)</p>
                <div className="flex flex-wrap gap-2">
                  {[2012, 2014, 2016, 2018, 2020, 2022, 2024].map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`min-w-[52px] rounded-lg border px-3 py-2 transition ${
                        year === selectedYear
                          ? "border-blue-400 bg-blue-500/30 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.25)]"
                          : "border-blue-600/40 bg-[#071935] text-blue-100/80 hover:border-blue-400/70"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-cyan-700/20 bg-[#041627]/70 p-3">
                <p className="mb-2 text-xs font-semibold text-cyan-300 uppercase">
                  ML Predicted Future (2025 - 2030)
                </p>
                <div className="flex flex-wrap gap-2">
                  {[2025, 2026, 2027, 2028, 2029, 2030].map((yr) => {
                    const score = getPredictedYearScore(yr);
                    const isRecoveryYear = yr === 2025 || yr === 2026;
                    return (
                      <button
                        key={yr}
                        onClick={() => setSelectedYear(yr)}
                        className={`min-w-[64px] rounded-lg border px-3 py-2 transition text-sm ${
                          yr === selectedYear
                            ? "border-cyan-300 bg-cyan-500/20 text-white shadow-[0_0_0_1px_rgba(6,182,212,0.15)]"
                            : "border-cyan-700/40 bg-[#071935] text-cyan-100/85 hover:border-cyan-400/60"
                        }`}
                      >
                        <div className="font-semibold">{yr}</div>
                        <div className="text-[11px] text-cyan-200/80">
                          {score !== null ? score : "—"}
                        </div>
                        {isRecoveryYear && (
                          <div className="text-[9px] text-emerald-300/70 leading-tight">recovery</div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[10px] text-cyan-300/60">
                  Scores from ML model · 2025–2026 are post-crisis recovery years
                </p>
              </div>

              {mlPrediction !== null && (
                <div className="rounded-xl border border-cyan-500/30 bg-[#05173f]/70 p-3">
                  <p className="mb-2 text-xs font-semibold text-cyan-300 uppercase">📈 Model Baseline</p>
                  <p className="text-xs text-cyan-200/80">
                    ML model baseline for {selectedWard?.name ?? "selected ward"} (2024):{" "}
                    <span className="font-bold text-cyan-300">{mlPrediction}</span>. Future trend shown as dashed cyan line.
                  </p>
                </div>
              )}
            </div>

            <RiskTable currentScore={currentRiskScore} />
          </section>

          <section className="rounded-2xl border border-blue-500/30 bg-[#061327]/80 p-4 shadow-[0_0_0_1px_rgba(30,64,175,0.2),0_30px_80px_rgba(2,6,23,0.7)] backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold uppercase tracking-wide text-blue-100">Bengaluru Water Potential Map</h2>
              <p className="text-xs uppercase tracking-wide text-blue-200/70">Click on any region to view trend</p>
            </div>

            <BengaluruMap
              selectedWard={selectedWard}
              onWardSelect={setSelectedWard}
              onHighRiskWardChange={setHighRiskWard}
            />
          </section>
        </main>
      </div>
    </div>
  );
}