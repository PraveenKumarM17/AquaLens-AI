import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, GeoJSON, Popup, Marker, useMap } from "react-leaflet";

import bbmpGeoJsonRaw from "../data/BBMP.geojson?raw";

const bbmpGeoJson = JSON.parse(bbmpGeoJsonRaw);

const offices = [
  { name: "Yelahanka Office", position: [13.1021, 77.5963] },
  { name: "K.R. Circle Office", position: [12.9716, 77.5946] },
  { name: "Whitefield Office", position: [12.9698, 77.7500] },
  { name: "Jayangar Office", position: [12.9250, 77.5938] },
  { name: "K.R. Puram Office", position: [13.0050, 77.6950] },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scoreToColor(score) {
  // Map score to color according to risk bands
  if (score >= 95) return "#b91c1c"; // Critical - deep red
  if (score >= 85) return "#ef4444"; // High - red
  if (score >= 70) return "#f97316"; // Medium-High - orange
  if (score >= 50) return "#f59e0b"; // Medium - amber
  if (score >= 30) return "#10b981"; // Low-Medium - emerald
  return "#06b6d4"; // Safe - cyan
}

function getCategory(score) {
  if (score >= 95) return "Critical";
  if (score >= 85) return "High";
  if (score >= 70) return "Medium-High";
  if (score >= 50) return "Medium";
  if (score >= 30) return "Low-Medium";
  return "Safe";
}

function createInitialScores(data) {
  const scores = {};

  data.features.forEach((feature) => {
    const wardNo = Number(feature.properties.KGISWardNo) || 0;
    const seeded = Math.abs(Math.sin(wardNo * 12.37) * 100);
    scores[feature.properties.KGISWardCode] = Math.round(clamp(seeded, 15, 95));
  });

  return scores;
}

function FitGeoBounds({ data }) {
  const map = useMap();

  useEffect(() => {
    // Keep map centered on Bengaluru without changing zoom level
    // Use a fixed center and zoom so we don't auto-zoom when data changes
    map.setView([12.9716, 77.5946], 11);
  }, [data, map]);

  return null;
}

export default function BengaluruMap({ selectedWard, onWardSelect, onHighRiskWardChange }) {
  const [scores, setScores] = useState(() => createInitialScores(bbmpGeoJson));
  const [infoOpen, setInfoOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const layerRef = useRef(null);

  // DivIcon for pin-style office markers
  const pinIcon = L.divIcon({
    className: "bb-pin-icon",
    html: `
      <svg width="28" height="36" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C7.03 0 3 4.03 3 9c0 6.63 9 22 9 22s9-15.37 9-22c0-4.97-4.03-9-9-9z" fill="#84cc16" stroke="#ffffff" stroke-width="1"/>
        <circle cx="12" cy="9" r="4" fill="#ecfccb" />
      </svg>
    `,
    iconSize: [28, 36],
    iconAnchor: [14, 34],
  });

  useEffect(() => {
    const id = setInterval(() => {
      setScores((prev) => {
        const next = { ...prev };

        Object.keys(next).forEach((key) => {
          const drift = Math.floor(Math.random() * 11) - 5;
          next[key] = clamp(next[key] + drift, 0, 100);
        });

        return next;
      });
    }, 3000);

    return () => clearInterval(id);
  }, []);

  const highestHighRiskWard = useMemo(() => {
    let bestWard = null;

    bbmpGeoJson.features.forEach((feature) => {
      const wardCode = feature.properties.KGISWardCode;
      const score = scores[wardCode] ?? 0;

      if (score >= 85 && (!bestWard || score > bestWard.score)) {
        bestWard = {
          code: wardCode,
          name: feature.properties.KGISWardName,
          number: feature.properties.KGISWardNo,
          score,
        };
      }
    });

    return bestWard;
  }, [scores]);

  useEffect(() => {
    onHighRiskWardChange?.(highestHighRiskWard);
  }, [highestHighRiskWard, onHighRiskWardChange]);

  const geoJsonKey = useMemo(() => `${selectedWard?.code ?? "none"}-${JSON.stringify(scores)}`, [selectedWard?.code, scores]);

  const onEachFeature = (feature, layer) => {
    const wardCode = feature.properties.KGISWardCode;
    const wardName = feature.properties.KGISWardName;
    const wardNo = feature.properties.KGISWardNo;
    const score = scores[wardCode] ?? 0;

    const category = getCategory(score);

    layer.bindTooltip(`${wardName} (Ward ${wardNo}) — ${score} (${category})`, {
      sticky: true,
      direction: "top",
      opacity: 0.95,
    });

    layer.on({
      mouseover: () => {
        layer.setStyle({ weight: 2.2, color: "#ffffff", fillOpacity: 0.95 });
      },
      mouseout: () => {
        const selectedCode = selectedWard?.code;
        if (selectedCode !== wardCode) {
          layer.setStyle({ weight: 1.1, color: "#93c5fd", fillOpacity: 0.72 });
        }
      },
      click: () => {
        onWardSelect?.({
          code: wardCode,
          name: wardName,
          number: wardNo,
          score,
        });
      },
    });
  };

  return (
    <div className="relative h-180 rounded-2xl border border-blue-500/25 bg-[#030c1d] p-3">
      {legendOpen ? (
        <div className="absolute right-4 top-4 z-500 rounded-xl border border-blue-500/35 bg-[#061631]/95 p-3 text-xs text-blue-100 shadow-lg text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Legend</div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Toggle map info"
                onClick={() => setInfoOpen((s) => !s)}
                className="rounded bg-blue-700/20 px-2 py-0.5 text-xs"
              >
                Info
              </button>
              <button aria-label="Collapse legend" onClick={() => setLegendOpen(false)} className="rounded bg-blue-700/20 px-2 py-0.5 text-xs">−</button>
            </div>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#b91c1c' }} />
            <span className="text-sm">Critical (95 - 100)</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#ef4444' }} />
            <span className="text-sm">High (85 - 95)</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#f97316' }} />
            <span className="text-sm">Medium-High (70 - 85)</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#f59e0b' }} />
            <span className="text-sm">Medium (50 - 70)</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#10b981' }} />
            <span className="text-sm">Low-Medium (30 - 50)</span>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: '#06b6d4' }} />
            <span className="text-sm">Safe (0 - 30)</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded bg-lime-400" />
            <span className="text-sm">BWSSB Offices</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          className="absolute right-4 top-4 z-500 rounded-full border border-blue-500/35 bg-[#061631]/95 p-2 text-xs text-blue-100 shadow-lg cursor-pointer"
          aria-label="Open legend"
        >
          ☰
        </button>
      )}

      <div className="h-[78%] overflow-hidden rounded-xl border border-blue-500/25">
        <MapContainer
          center={[12.9716, 77.5946]}
          zoom={11}
          minZoom={10}
          maxZoom={16}
          zoomControl={false}
          className="h-full w-full"
        >
          {/* Zoom disabled: no zoom control rendered */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          <FitGeoBounds data={bbmpGeoJson} />

          <GeoJSON
            key={geoJsonKey}
            ref={layerRef}
            data={bbmpGeoJson}
            style={(feature) => {
              const score = scores[feature.properties.KGISWardCode] ?? 0;
              const isSelected = selectedWard?.code === feature.properties.KGISWardCode;

              return {
                color: isSelected ? "#e2e8f0" : "#93c5fd",
                weight: isSelected ? 2.5 : 1.1,
                fillColor: scoreToColor(score),
                fillOpacity: isSelected ? 0.92 : 0.72,
              };
            }}
            onEachFeature={onEachFeature}
          />

          {offices.map((office) => (
            <Marker key={office.name} position={office.position} icon={pinIcon} eventHandlers={{ click: () => {} }}>
              <Popup>{office.name}</Popup>
            </Marker>
          ))}
          </MapContainer>
        </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-blue-500/25 bg-[#051733]/70 p-3 text-sm text-blue-100/85">
          <p className="mb-1 font-semibold text-lime-300">Selected Ward</p>
          <p>
            {selectedWard
              ? `${selectedWard.name} (Ward ${selectedWard.number}) - ${selectedWard.score} (${getCategory(selectedWard.score)})`
              : "Click a ward to view details."}
          </p>
        </div>
      </div>

      {/* Info popover rendered when legend button is toggled */}
      {infoOpen && (
        <div className="absolute right-4 top-20 z-600 w-80 rounded-xl border border-blue-500/30 bg-[#021323]/95 p-3 text-sm text-blue-100 shadow-2xl">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-1 font-semibold text-cyan-300">Map Info</p>
              <p className="text-xs text-blue-200/80">BBMP ward polygons are rendered from GeoJSON. Colors represent live underground water potential scores.</p>
            </div>
            <button onClick={() => setInfoOpen(false)} className="ml-3 rounded bg-blue-700/30 px-2 py-1 text-xs">Close</button>
          </div>
          <div className="mt-3 text-xs">
            <p className="font-semibold text-blue-100/90">Selected Ward</p>
            <p className="text-blue-200/80">{selectedWard ? `${selectedWard.name} (Ward ${selectedWard.number}) - ${selectedWard.score} (${getCategory(selectedWard.score)})` : 'Click a ward to view details.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
