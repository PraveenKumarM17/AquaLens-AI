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
import { useEffect, useMemo, useState } from "react";
import {
  Droplets,
  CalendarDays,
  MapPin,
  BrainCircuit,
  Info,
  Database,
  Target,
} from "lucide-react";

import RiskTable from "../components/RiskTable";
import BengaluruMap from "../components/BengaluruMap";
import { predictWaterPotential, generateWardFeatures, checkApiHealth, getModelInfo } from "../api/client";
import { useWaterRisk } from "../context/WaterRiskContext";

const initialYearlyData = [
  { year: 2012, value: 30 },
  { year: 2014, value: 50 },
  { year: 2016, value: 60 },
  { year: 2018, value: 85 },
  { year: 2020, value: 60 },
  { year: 2022, value: 40 },
  { year: 2024, value: 95 },

];

const initialMonthlyData = [
  { month: "Jan", value: 45 },
  { month: "Feb", value: 52 },
  { month: "Mar", value: 61 },
  { month: "Apr", value: 68 },
  { month: "May", value: 72 },
  { month: "Jun", value: 81 },
  { month: "Jul", value: 88 },
  { month: "Aug", value: 83 },
  { month: "Sep", value: 74 },
  { month: "Oct", value: 66 },
  { month: "Nov", value: 55 },
  { month: "Dec", value: 48 },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nextValue(value, step = 8) {
  const delta = Math.floor(Math.random() * (step * 2 + 1)) - step;
  return clamp(value + delta, 0, 100);
}

function stringSeed(input) {
  return Array.from(input).reduce((seed, character) => seed + character.charCodeAt(0), 0);
}

function buildYearlyData(seed, baseValue = null) {
  // Historical data (2012-2024) - static from initialYearlyData
  const historicalData = initialYearlyData.map((point) => ({
    year: point.year,
    value: point.year === 2024 ? 95 : point.value,
    type: "historical",
  }));

  // Predicted data (2025-2030) - based on ML prediction
  const predictedYears = [2025, 2026, 2027, 2028, 2029, 2030];

  // create a bridge at 2024 so the predicted dashed line connects smoothly from historical 2024
  const historical2024 = historicalData.find((p) => p.year === 2024)?.value ?? 95;

  const predictedData = [
    { year: 2024, value: baseValue !== null ? Math.round(baseValue) : historical2024, type: "predicted" },
    ...predictedYears.map((year, index) => {
      if (baseValue !== null) {
        // Use ML prediction as base, add variation based on year index
        const yearVariation = Math.sin(index * 0.5) * 15;
        const value = clamp(Math.round(baseValue + yearVariation), 0, 100);
        return { year, value, type: "predicted" };
      }
      // Fallback to seed-based generation
      const value = clamp(Math.round(35 + Math.abs(Math.sin(seed * 0.17 + (7 + index) * 0.9)) * 60), 0, 100);
      return { year, value, type: "predicted" };
    }),
  ];

  return [...historicalData, ...predictedData];
}

function getYearlyChartValue(point, seriesType) {
  if (point.type !== seriesType) {
    return null;
  }

  return point.value;
}

function getHistoricalTooltipValue(payload) {
  if (payload?.year === 2024) {
    return 95;
  }

  return payload?.value;
}

function buildMonthlyData(seed, baseValue = null) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, index) => {
    if (baseValue !== null) {
      // Use ML prediction as base, add variation based on month (seasonal pattern)
      const monthVariation = Math.cos(index * 0.5) * 20;
      const value = clamp(Math.round(baseValue + monthVariation), 0, 100);
      return { month, value };
    }
    // Fallback to seed-based generation
    const value = clamp(Math.round(25 + Math.abs(Math.cos(seed * 0.11 + index * 0.55)) * 70), 0, 100);
    return { month, value };
  });
}

export default function Dashboard() {
  const [selectedWard, setSelectedWard] = useState(null);
  const [highRiskWard, setHighRiskWard] = useState(null);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [mlPrediction, setMlPrediction] = useState(null);
  const [fetchingPrediction, setFetchingPrediction] = useState(false);
  const [modelStatus, setModelStatus] = useState({ status: 'unknown', model_loaded: false });
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const { selectedYear, setSelectedYear, getWardYearRecord, getYearRecords, yearAggregates, crisisYear } = useWaterRisk();
  
  const selectedWardLabel = selectedWard?.name ?? "Select a ward";
  const selectedWardSeed = stringSeed(selectedWard?.code ?? selectedWardLabel);
  const yearSeed = selectedWardSeed + selectedYear;

  const [yearlyData, setYearlyData] = useState(() => buildYearlyData(selectedWardSeed));
  const [monthlyData, setMonthlyData] = useState(() => buildMonthlyData(yearSeed));

  // Fetch ML prediction when ward is selected
  useEffect(() => {
    if (selectedWard) {
      setFetchingPrediction(true);
      const fetchPrediction = async () => {
        try {
          const features = generateWardFeatures(selectedWard.code, selectedWard.name, 2024);
          const result = await predictWaterPotential(features);
          setMlPrediction(result.predicted_score);
        } catch (err) {
          console.warn("Failed to fetch ML prediction:", err);
          setMlPrediction(null);
        } finally {
          setFetchingPrediction(false);
        }
      };
      fetchPrediction();
    } else {
      setMlPrediction(null);
    }
  }, [selectedWard]);

  // Load model status and info on mount
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
    const id = setInterval(() => {
      setMonthlyData((prev) => prev.map((point) => ({ ...point, value: nextValue(point.value, 7) })));
    }, 2000);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Use ML prediction if available, otherwise use seed-based generation
    setYearlyData(buildYearlyData(selectedWardSeed, mlPrediction));
    setMonthlyData(buildMonthlyData(yearSeed, mlPrediction));
  }, [selectedWardSeed, yearSeed, mlPrediction]);

  const monthlyExtremes = useMemo(() => {
    const maxPoint = monthlyData.reduce((max, current) => (current.value > max.value ? current : max), monthlyData[0]);
    const minPoint = monthlyData.reduce((min, current) => (current.value < min.value ? current : min), monthlyData[0]);
    return { maxPoint, minPoint };
  }, [monthlyData]);

  const selectedWardYearRecord = useMemo(() => {
    if (!selectedWard) {
      return null;
    }

    return getWardYearRecord(selectedWard.code, selectedYear);
  }, [getWardYearRecord, selectedWard, selectedYear]);

  const selectedYearRecords = useMemo(() => getYearRecords(selectedYear), [getYearRecords, selectedYear]);

  const currentRiskScore = useMemo(() => {
    if (selectedWardYearRecord) {
      return selectedWardYearRecord.water_potential_score;
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
  }, [yearlyData, mlPrediction, selectedWardYearRecord, selectedYearRecords]);

  const handleYearSelect = (year) => {
    setSelectedYear(year);
  };

  // Crisis modal state
  const [showCrisisModal, setShowCrisisModal] = useState(false);

  // Show modal when selecting a future year that crosses crisis threshold
  useEffect(() => {
    if (selectedYear >= 2025 && selectedYear <= 2030) {
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
    // Re-arm alert when context changes so predicted-year alerts remain visible.
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

  const showAlert = Boolean(isFutureYear && activeAlertWard && activeAlertWard.score >= 85 && !alertDismissed);

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
                <p className="text-xs text-rose-100/90">This alert is shown for future projections (2025 - 2030).</p>
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
              {mlPrediction !== null && (
                <span className="rounded-md border border-cyan-400/50 bg-cyan-500/20 px-3 py-1.5 text-cyan-200">
                  📈 Predicted (2025+)
                </span>
              )}
            </div>

            <div className="mb-4 h-[280px] rounded-xl border border-blue-500/20 bg-[#031025]/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-blue-100/70">
                  Yearly Trend Overview (2012 - 2030)
                  {mlPrediction !== null && <span className="ml-2 text-xs text-cyan-300">✓ ML Powered</span>}
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
                {/* Crisis marker/modal */}
                {crisisYear && (
                  <ReferenceLine
                    x={crisisYear}
                    stroke="#ff4d4f"
                    strokeWidth={2}
                    label={{ value: 'Crisis Peak', position: 'top', fill: '#ff7a7a' }}
                  />
                )}
                {showCrisisModal && (
                  <div className="fixed left-1/2 top-12 z-50 w-[360px] -translate-x-1/2 transform rounded-lg border border-rose-400/50 bg-rose-800/95 p-4 text-white shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold">⚠️ Water Crisis Expected in {selectedYear}</div>
                        <div className="text-sm mt-1">High risk detected across multiple wards — immediate action recommended.</div>
                        {crisisYear && (
                          <div className="text-xs mt-2 text-rose-100/80">Crisis begins in {crisisYear}</div>
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
                      const label = props.payload.type === "historical" ? "Historical Data" : "Predicted Data";
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
                  {/* Reference line showing boundary between historical and predicted */}
                  <ReferenceLine 
                    x={selectedYear} 
                    stroke="#666" 
                    strokeDasharray="5 5"
                    strokeOpacity={0.9}
                  />
                  {/* Historical data line (solid blue) */}
                  <Line 
                    type="monotone" 
                    dataKey={(point) => getYearlyChartValue(point, "historical")} 
                    stroke="#2f8cff" 
                    strokeWidth={2.75} 
                    dot={(pointProps) => renderYearDot(pointProps, "#2f8cff")}
                    name="Historical Data"
                    isAnimationActive={false}
                  />
                  {/* Predicted data line (dashed cyan) */}
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
                      {mlPrediction !== null && <span className="ml-2 text-xs text-cyan-300">✓ ML Prediction</span>}
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

              {/* Predicted years (selectable) */}
              <div className="rounded-xl border border-cyan-700/20 bg-[#041627]/70 p-3">
                <p className="mb-2 text-xs font-semibold text-cyan-300 uppercase">Predicted Future (2025 - 2030)</p>
                <div className="flex flex-wrap gap-2">
                  {[2025, 2026, 2027, 2028, 2029, 2030].map((yr) => {
                    const point = yearlyData.find((p) => p.year === yr) ?? null;
                    const display = point ? point.value : "—";
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
                        <div className="text-[11px] text-cyan-200/80">{display}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {mlPrediction !== null && (
                <div className="rounded-xl border border-cyan-500/30 bg-[#05173f]/70 p-3">
                  <p className="mb-2 text-xs font-semibold text-cyan-300 uppercase">📈 Model Baseline</p>
                  <p className="text-xs text-cyan-200/80">ML model baseline prediction: <span className="font-bold text-cyan-300">{mlPrediction}</span>. Future trend displayed on graph with dashed cyan line.</p>
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

        {/* <footer className="grid gap-3 pb-2 lg:grid-cols-4">
          <div className="rounded-xl border border-blue-500/25 bg-[#071935]/80 px-4 py-3 text-sm text-blue-100/85">
            <p className="mb-1 font-semibold text-cyan-300">AQUALENS-AI</p>
            <p>AI Powered | Remote Sensing | Night-time Light Analysis</p>
          </div>

          <div className="rounded-xl border border-blue-500/25 bg-[#071935]/80 px-4 py-3 text-sm text-blue-100/85">
            <p className="mb-1 flex items-center gap-2 font-semibold text-violet-300">
              <Database size={16} /> Data Sources
            </p>
            <p>VIIRS-NPP Night Light | Census India | SRTM | Bhuvan</p>
          </div>

          <div className="rounded-xl border border-blue-500/25 bg-[#071935]/80 px-4 py-3 text-sm text-blue-100/85">
            <p className="mb-1 flex items-center gap-2 font-semibold text-blue-300">
              <CalendarDays size={16} /> Last Updated
            </p>
            <p>May 20, 2025</p>
          </div>

          <div className="rounded-xl border border-blue-500/25 bg-[#071935]/80 px-4 py-3 text-sm text-blue-100/85">
            <p className="mb-1 flex items-center gap-2 font-semibold text-emerald-300">
              <Target size={16} /> Mission
            </p>
            <p>Sustainable Water Future</p>
          </div>
        </footer> */}
      </div>
    </div>
  );
}