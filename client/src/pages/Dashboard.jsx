import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
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

const initialYearlyData = [
  { year: 2012, value: 30 },
  { year: 2014, value: 50 },
  { year: 2016, value: 60 },
  { year: 2018, value: 85 },
  { year: 2020, value: 60 },
  { year: 2022, value: 40 },
  { year: 2024, value: 70 },
  { year: 2026, value: 76 },
  { year: 2028, value: 82 },
  { year: 2030, value: 88 },
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

function buildYearlyData(seed) {
  return [2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026, 2028, 2030].map((year, index) => {
    const value = clamp(Math.round(35 + Math.abs(Math.sin(seed * 0.17 + index * 0.9)) * 60), 0, 100);
    return { year, value };
  });
}

function buildMonthlyData(seed) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, index) => {
    const value = clamp(Math.round(25 + Math.abs(Math.cos(seed * 0.11 + index * 0.55)) * 70), 0, 100);
    return { month, value };
  });
}

export default function Dashboard() {
  const [selectedWard, setSelectedWard] = useState(null);
  const [selectedYear, setSelectedYear] = useState(2018);
  const [highRiskWard, setHighRiskWard] = useState(null);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const selectedWardLabel = selectedWard?.name ?? "Select a ward";
  const selectedWardSeed = stringSeed(selectedWard?.code ?? selectedWardLabel);
  const yearSeed = selectedWardSeed + selectedYear;

  const [yearlyData, setYearlyData] = useState(() => buildYearlyData(selectedWardSeed));
  const [monthlyData, setMonthlyData] = useState(() => buildMonthlyData(yearSeed));

  useEffect(() => {
    const id = setInterval(() => {
      setYearlyData((prev) => prev.map((point) => ({ ...point, value: nextValue(point.value, 6) })));
      setMonthlyData((prev) => prev.map((point) => ({ ...point, value: nextValue(point.value, 7) })));
    }, 2000);

    return () => clearInterval(id);
  }, []);

  const monthlyExtremes = useMemo(() => {
    const maxPoint = monthlyData.reduce((max, current) => (current.value > max.value ? current : max), monthlyData[0]);
    const minPoint = monthlyData.reduce((min, current) => (current.value < min.value ? current : min), monthlyData[0]);
    return { maxPoint, minPoint };
  }, [monthlyData]);

  const currentRiskScore = useMemo(() => {
    const avg = yearlyData.reduce((sum, point) => sum + point.value, 0) / yearlyData.length;
    return Math.round(avg);
  }, [yearlyData]);

  useEffect(() => {
    setYearlyData(buildYearlyData(selectedWardSeed));
    setMonthlyData(buildMonthlyData(yearSeed));
  }, [selectedWardSeed, yearSeed]);

  useEffect(() => {
    setAlertDismissed(false);
  }, [highRiskWard?.code]);

  const activeAlertWard = selectedWard?.score >= 85 ? selectedWard : highRiskWard;
  const showAlert = Boolean(activeAlertWard && activeAlertWard.score >= 85 && !alertDismissed);

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
              <p className="text-lg font-semibold">AQUALENS-AI v1.0</p>
            </div>
          </div>
        </header>

        {showAlert && (
          <div className="rounded-xl border border-rose-400/50 bg-rose-700/90 p-3 text-white shadow-lg">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-wide">Automatic Alert</p>
                <p className="text-sm">
                  {activeAlertWard.name} (Ward {activeAlertWard.number}) is in a HIGH risk zone with score {activeAlertWard.score}.
                </p>
                <p className="text-xs text-rose-100/90">This alert appears automatically even when no area is selected.</p>
              </div>

              <button
                type="button"
                onClick={() => setAlertDismissed(true)}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
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
            </div>

            <div className="mb-4 h-[280px] rounded-xl border border-blue-500/20 bg-[#031025]/70 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-blue-100/70">Yearly Trend Overview (2012 - 2030)</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={yearlyData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="year"
                    axisLine={{ stroke: "#1f3b67" }}
                    tickLine={false}
                    tick={{ fill: "#9bbadf", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={{ stroke: "#1f3b67" }}
                    tickLine={false}
                    domain={[0, 100]}
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
                  />
                  <Line type="monotone" dataKey="value" stroke="#1d8bff" strokeWidth={3} dot={{ r: 4, fill: "#1d8bff" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {selectedWard ? (
              <>
                <div className="mb-4 h-[170px] rounded-xl border border-blue-500/20 bg-[#031025]/70 p-3">
                  <p className="mb-2 text-sm text-blue-100/90">Monthly Trend for {selectedWardLabel} - {selectedYear}</p>
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

            {selectedWard ? (
              <div className="mb-4 overflow-x-auto pb-1">
                <div className="flex min-w-max gap-2 text-sm">
                  {[2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026, 2028, 2030].map((year) => (
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
            ) : (
              <div className="mb-4 rounded-xl border border-blue-500/20 bg-[#051733]/70 px-3 py-3 text-sm text-blue-200/70">
                Select a region on the map to view year options.
              </div>
            )}

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

        <footer className="grid gap-3 pb-2 lg:grid-cols-4">
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
        </footer>
      </div>
    </div>
  );
}