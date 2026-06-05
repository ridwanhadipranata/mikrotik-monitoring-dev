"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Escape HTML to prevent XSS
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Workaround for Leaflet default marker icons in Next.js/webpack
// See: https://github.com/Leaflet/Leaflet/issues/4968
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface CustomerMarker {
  name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  simpleQueue: string;
  phone: string;
}

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: string;
  customers?: CustomerMarker[];
  showAllMarkers?: boolean;
}

export default function MapPicker({
  lat, lng, onChange, height = "300px", customers = [], showAllMarkers = false,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const streetLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // ── Initialize map ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = lat && lng ? [lat, lng] : [-7.5, 110.5];
    const map = L.map(containerRef.current, {
      center,
      zoom: lat && lng ? 15 : 10,
      zoomControl: false,
      attributionControl: false,
    });

    // Zoom control bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });

    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "© Esri",
    });

    // Google Hybrid overlay (labels on satellite)
    const labels = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.3,
    });

    street.addTo(map);
    streetLayerRef.current = street;
    satLayerRef.current = sat;

    map.on("click", (e: L.LeafletMouseEvent) => {
      if (showAllMarkers) return;
      const { lat: newLat, lng: newLng } = e.latlng;
      placeMarker(newLat, newLng);
      onChangeRef.current(newLat, newLng);
    });

    mapRef.current = map;

    requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      markersRef.current = [];
    };
  }, []);

  // ── Place single marker ─────────────────────────────────────
  const placeMarker = useCallback((newLat: number, newLng: number) => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng([newLat, newLng]);
    } else {
      const m = L.marker([newLat, newLng], { draggable: true }).addTo(map);
      m.on("dragend", () => {
        const pos = m.getLatLng();
        onChangeRef.current(pos.lat, pos.lng);
      });
      markerRef.current = m;
    }
    map.setView([newLat, newLng], Math.max(map.getZoom(), 14));
  }, []);

  // ── Sync single marker from props ───────────────────────────
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (lat != null && lng != null && !showAllMarkers) {
      placeMarker(lat, lng);
    }
  }, [lat, lng, ready, showAllMarkers, placeMarker]);

  // ── Show all customer markers ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !showAllMarkers) return;

    for (const m of markersRef.current) map.removeLayer(m);
    markersRef.current = [];

    const valid = customers.filter((c) => c.lat != null && c.lng != null);
    const bounds: [number, number][] = [];

    for (const c of valid) {
      const color =
        c.status === "active" ? "#34C759" :
        c.status === "suspended" ? "#FF9500" : "#FF3B30";

      const safeName = escapeHtml(c.name);
      const safeQueue = escapeHtml(c.simpleQueue);
      const safePhone = escapeHtml(c.phone);

      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:32px;height:32px;border-radius:50%;
          background:${color};
          border:3px solid white;
          box-shadow:0 3px 12px rgba(0,0,0,0.3);
          display:flex;align-items:center;justify-content:center;
          font-family:-apple-system,sans-serif;
          transition:transform 0.2s;
        "><span style="color:white;font-size:13px;font-weight:700;">${escapeHtml(c.name.charAt(0).toUpperCase())}</span></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });

      const m = L.marker([c.lat!, c.lng!], { icon });
      m.bindPopup(
        `<div style="font-family:-apple-system,sans-serif;min-width:200px;padding:4px 0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="width:32px;height:32px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;">
              <span style="color:white;font-size:14px;font-weight:700;">${escapeHtml(c.name.charAt(0).toUpperCase())}</span>
            </div>
            <div>
              <p style="font-weight:700;font-size:14px;margin:0;color:#1d1d1f;">${safeName}</p>
              <span style="font-size:11px;color:${color};font-weight:600;">${c.status === "active" ? "● Aktif" : c.status === "suspended" ? "● Suspended" : "● Putus"}</span>
            </div>
          </div>
          <div style="border-top:1px solid #f0f0f0;padding-top:8px;font-size:12px;color:#6e6e73;">
            <p style="margin:0 0 3px;">📶 Queue: <strong style="color:#1d1d1f;">${safeQueue}</strong></p>
            ${c.phone ? `<p style="margin:0 0 3px;">📞 ${safePhone}</p>` : ""}
            <p style="margin:0;color:#007AFF;font-size:11px;">📍 ${c.lat!.toFixed(6)}, ${c.lng!.toFixed(6)}</p>
          </div>
        </div>`,
        { className: "custom-popup" }
      );
      m.addTo(map);
      markersRef.current.push(m);
      bounds.push([c.lat!, c.lng!]);
    }

    if (bounds.length > 0) {
      setTimeout(() => {
        map.invalidateSize({ animate: false });
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }, 150);
    }
  }, [customers, showAllMarkers, ready]);

  // ── Toggle satellite/street ─────────────────────────────────
  const toggleLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || !streetLayerRef.current || !satLayerRef.current) return;
    if (satellite) {
      map.removeLayer(satLayerRef.current);
      streetLayerRef.current.addTo(map);
    } else {
      map.removeLayer(streetLayerRef.current);
      satLayerRef.current.addTo(map);
    }
    setSatellite(!satellite);
  }, [satellite]);

  // ── Search address ──────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`,
        { headers: { "Accept-Language": "id" } }
      );
      const data = await res.json();
      if (data?.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        placeMarker(newLat, newLng);
        onChangeRef.current(newLat, newLng);
      }
    } catch {}
    setSearching(false);
  };

  return (
    <div className="relative w-full h-full">
        {/* Search bar (picker mode only) */}
        {!showAllMarkers && (
          <div className="absolute top-3 left-3 right-16 z-[1000]">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Cari alamat atau tempat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="!pl-3 !pr-3 !py-2.5 !text-[13px] !rounded-xl
                             bg-[var(--bg-card)]/95 backdrop-blur-md
                             border border-[var(--border)] shadow-[var(--shadow-md)]"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="btn btn-primary !px-4 !py-2.5 !text-[12px] !rounded-xl shadow-[var(--shadow-md)]"
              >
                {searching ? "..." : "Cari"}
              </button>
            </div>
          </div>
        )}

        {/* Map */}
        <div
          ref={containerRef}
          style={{ height: "100%", width: "100%", minHeight: 200 }}
        />

        {/* Layer toggle */}
        <button
          type="button"
          onClick={toggleLayer}
          className="absolute top-3 right-3 z-[1000] flex items-center gap-2
                     px-3.5 py-2 rounded-xl text-[12px] font-semibold
                     bg-[var(--bg-card)]/95 backdrop-blur-md
                     border border-[var(--border)] shadow-[var(--shadow-md)]
                     text-[var(--text-primary)]
                     hover:shadow-[var(--shadow-lg)] active:scale-95 transition-all"
          aria-label={satellite ? "Switch to Street map" : "Switch to Satellite view"}
          title={satellite ? "Switch to Street" : "Switch to Satellite"}
        >
          <span className="text-[14px]">{satellite ? "🗺️" : "🛰️"}</span>
          <span>{satellite ? "Street" : "Satelit"}</span>
        </button>

        {/* Coordinates display (picker mode) */}
        {!showAllMarkers && lat != null && lng != null && (
          <div className="absolute bottom-3 left-3 z-[1000]
                          px-3 py-1.5 rounded-lg
                          bg-[var(--bg-card)]/95 backdrop-blur-md
                          border border-[var(--border)] shadow-[var(--shadow-sm)]">
            <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
              📍 {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
          </div>
        )}
    </div>
  );
}
