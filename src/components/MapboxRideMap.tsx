import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Search, X } from 'lucide-react';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM      = 'https://router.project-osrm.org/route/v1/driving';
const UA        = 'GerakApp/1.0';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  campusCenter: [number, number]; // [lng, lat]
  onPickupChange: (name: string) => void;
  onDestinationChange: (name: string) => void;
}

export const MapboxRideMap: React.FC<Props> = ({ campusCenter, onPickupChange, onDestinationChange }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map          = useRef<maplibregl.Map | null>(null);
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker   = useRef<maplibregl.Marker | null>(null);
  const searchRef    = useRef<HTMLDivElement>(null);

  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [pickupName,   setPickupName]   = useState('');
  const [destCoords,   setDestCoords]   = useState<[number, number] | null>(null);
  const [destName,     setDestName]     = useState('');

  const [query,           setQuery]           = useState('');
  const [suggestions,     setSuggestions]     = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locating,        setLocating]        = useState(false);
  const [searching,       setSearching]       = useState(false);
  const [routeInfo,       setRouteInfo]       = useState<{ distanceKm: string; durationMin: string } | null>(null);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style:     MAP_STYLE,
      center:    campusCenter,
      zoom:      13,
    });
    map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    return () => { map.current?.remove(); map.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-locate on mount ─────────────────────────────────────────────────────
  useEffect(() => { locateUser(); }, []);

  // ── Close suggestions on outside click ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Debounced search (300 ms) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const t = setTimeout(() => searchPlaces(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // ── Draw real road route when both pins set ──────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!m || !pickupCoords || !destCoords) return;

    const drawRoute = async () => {
      let routeCoords: [number, number][] = [pickupCoords, destCoords];
      try {
        const res  = await fetch(
          `${OSRM}/${pickupCoords[0]},${pickupCoords[1]};${destCoords[0]},${destCoords[1]}` +
          `?overview=full&geometries=geojson`
        );
        const json = await res.json();
        const route = json.routes?.[0];
        if (route?.geometry?.coordinates?.length) {
          routeCoords = route.geometry.coordinates;
          setRouteInfo({
            distanceKm: (route.distance / 1000).toFixed(1),
            durationMin: Math.ceil(route.duration / 60).toString(),
          });
        }
      } catch { setRouteInfo(null); /* straight-line fallback */ }

      const draw = () => {
        if (m.getLayer('route-line'))        m.removeLayer('route-line');
        if (m.getLayer('route-line-border')) m.removeLayer('route-line-border');
        if (m.getSource('route'))            m.removeSource('route');

        m.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } },
        });
        m.addLayer({
          id: 'route-line-border', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7 },
        });
        m.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 4 },
        });

        const bounds = new maplibregl.LngLatBounds(routeCoords[0], routeCoords[0]);
        routeCoords.forEach(c => bounds.extend(c));
        m.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      };

      if (m.loaded()) draw(); else m.once('load', draw);
    };

    drawRoute();
  }, [pickupCoords, destCoords]);

  // ── GPS locate ───────────────────────────────────────────────────────────────
  const locateUser = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { longitude, latitude } }) => {
        const coords: [number, number] = [longitude, latitude];
        placePickupMarker(coords);
        map.current?.flyTo({ center: coords, zoom: 15 });

        // Reverse geocode via Nominatim
        try {
          const res  = await fetch(
            `${NOMINATIM}/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
            { headers: { 'User-Agent': UA } }
          );
          const json = await res.json();
          const name = (json.display_name as string | undefined) ?? 'Current Location';
          setPickupName(name);
          onPickupChange(name);
        } catch {
          setPickupName('Current Location');
          onPickupChange('Current Location');
        }
        setLocating(false);
      },
      () => {
        placePickupMarker(campusCenter);
        setPickupName('UMPSA Campus');
        onPickupChange('UMPSA Campus');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  };

  const placePickupMarker = (coords: [number, number]) => {
    setPickupCoords(coords);
    if (pickupMarker.current) pickupMarker.current.remove();
    const el = Object.assign(document.createElement('div'), {
      className: 'w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md',
    });
    pickupMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map.current!);
  };

  // ── Nominatim search ──────────────────────────────────────────────────────────
  const searchPlaces = async (q: string) => {
    setSearching(true);
    try {
      const res  = await fetch(
        `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&countrycodes=my&limit=6&addressdetails=0&accept-language=en`,
        { headers: { 'User-Agent': UA } }
      );
      const json: NominatimResult[] = await res.json();
      setSuggestions(json);
      setShowSuggestions(json.length > 0);
    } catch {
      setSuggestions([]);
    }
    setSearching(false);
  };

  // ── Select destination ────────────────────────────────────────────────────────
  const selectDestination = (result: NominatimResult) => {
    const coords: [number, number] = [parseFloat(result.lon), parseFloat(result.lat)];
    const name = result.display_name;

    setDestCoords(coords);
    setDestName(name);
    onDestinationChange(name);
    setQuery(name);
    setShowSuggestions(false);

    if (destMarker.current) destMarker.current.remove();
    const el = Object.assign(document.createElement('div'), {
      className: 'w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-md',
    });
    destMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat(coords)
      .addTo(map.current!);
  };

  const clearDestination = () => {
    setQuery('');
    setDestName('');
    setDestCoords(null);
    setRouteInfo(null);
    onDestinationChange('');
    setSuggestions([]);
    setShowSuggestions(false);
    if (destMarker.current) { destMarker.current.remove(); destMarker.current = null; }
    const m = map.current;
    if (m) {
      if (m.getLayer('route-line'))        m.removeLayer('route-line');
      if (m.getLayer('route-line-border')) m.removeLayer('route-line-border');
      if (m.getSource('route'))            m.removeSource('route');
    }
  };

  return (
    <div className="relative flex flex-col gap-4">

      {/* Destination search */}
      <div ref={searchRef} className="relative z-10">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!e.target.value) clearDestination(); }}
            placeholder="Search destination… e.g. KLCC, LRT Masjid Jamek"
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-10 pr-9 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-primary transition shadow-sm"
          />
          {query ? (
            <button type="button" onClick={clearDestination}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          ) : searching ? (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          ) : null}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="max-h-52 overflow-y-auto">
              {suggestions.map((r, i) => {
                const parts = r.display_name.split(',');
                return (
                  <button key={r.place_id} type="button" onClick={() => selectDestination(r)}
                    className={`w-full text-left px-4 py-3 transition hover:bg-slate-50 ${
                      i < suggestions.length - 1 ? 'border-b border-slate-50' : ''
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-800 truncate">{parts[0]}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {parts.slice(1).join(',').trim()}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 260 }}>
        <div ref={mapContainer} className="w-full h-full" />
        <button type="button" onClick={locateUser} disabled={locating}
          className="absolute top-3 right-3 z-10 w-9 h-9 bg-white border border-slate-100 rounded-xl shadow flex items-center justify-center text-slate-600 hover:text-primary transition active:scale-90 disabled:opacity-50"
        >
          {locating
            ? <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            : <LocateFixed className="w-4 h-4" />}
        </button>
      </div>

      {/* Pin status row */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 p-3 rounded-2xl bg-blue-50 border border-blue-100 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-400">Pickup</p>
            <p className="text-xs font-semibold text-slate-700 truncate mt-0.5">
              {locating ? 'Detecting location…' : pickupName || 'Allow location access'}
            </p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2 p-3 rounded-2xl bg-red-50 border border-red-100 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-red-400">Destination</p>
            <p className="text-xs font-semibold text-slate-700 truncate mt-0.5">
              {destName || 'Search above'}
            </p>
          </div>
        </div>
      </div>

      {/* Route info strip — distance + ETA from OSRM */}
      {routeInfo && (
        <div className="flex items-center justify-center gap-4 py-2 px-4 bg-white border border-slate-100 rounded-2xl">
          <div className="flex flex-col items-center">
            <span className="text-base font-black text-slate-800">{routeInfo.distanceKm} km</span>
            <span className="text-xs font-normal text-slate-400">Distance</span>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="flex flex-col items-center">
            <span className="text-base font-black text-slate-800">{routeInfo.durationMin} min</span>
            <span className="text-xs font-normal text-slate-400">Est. drive time</span>
          </div>
        </div>
      )}
    </div>
  );
};
