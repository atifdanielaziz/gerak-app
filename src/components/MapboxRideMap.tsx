import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LocateFixed, Search, X } from 'lucide-react';

const MAP_STYLE   = 'https://tiles.openfreemap.org/styles/liberty';
const NOMINATIM   = 'https://nominatim.openstreetmap.org';
const OSRM        = 'https://router.project-osrm.org/route/v1/driving';
const GOOGLE_KEY  = import.meta.env.VITE_GOOGLE_PLACES_KEY as string | undefined;
const PLACES_AUTO = 'https://places.googleapis.com/v1/places:autocomplete';
const PLACES_DET  = 'https://places.googleapis.com/v1/places';

interface GoogleSuggestion {
  placeId:       string;
  mainText:      string;
  secondaryText: string;
  // Only set for a Nominatim-sourced fallback suggestion — coordinates are
  // already known from the search result itself, so selectPlace() can skip
  // the Google Place Details round-trip for these.
  coords?:       [number, number];
}

interface Props {
  campusCenter:        [number, number]; // [lng, lat]
  onPickupChange:      (name: string, coords: [number, number] | null) => void;
  onDestinationChange: (name: string, coords: [number, number] | null) => void;
  onRouteInfoChange?:  (info: { distanceKm: string; durationMin: number } | null) => void;
}

export const MapboxRideMap: React.FC<Props> = ({ campusCenter, onPickupChange, onDestinationChange, onRouteInfoChange }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map          = useRef<maplibregl.Map | null>(null);
  const pickupMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker   = useRef<maplibregl.Marker | null>(null);
  const searchRef    = useRef<HTMLDivElement>(null);

  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [destCoords,   setDestCoords]   = useState<[number, number] | null>(null);

  const [query,           setQuery]           = useState('');
  const [suggestions,     setSuggestions]     = useState<GoogleSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locating,        setLocating]        = useState(false);
  const [searching,       setSearching]       = useState(false);
  const [searchError,     setSearchError]     = useState<string | null>(null);
  const [locationNotice,  setLocationNotice]  = useState<string | null>(null);
  const [mapError,        setMapError]        = useState(false);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    // WebGL unavailable/disabled (old device, some in-app browsers) can
    // throw synchronously here, or the map can init but fail asynchronously
    // (context lost, style load failure) — previously neither was caught,
    // so "Search Map" mode just got stuck on the Suspense spinner forever
    // with no indication to the rider to switch to Quick/Custom instead.
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style:     MAP_STYLE,
        center:    campusCenter,
        zoom:      13,
      });
      map.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');
      map.current.on('error', () => setMapError(true));
    } catch {
      // Deferred, not called directly in the effect body — same pattern
      // used elsewhere in this codebase to avoid a synchronous
      // setState-in-effect cascade.
      setTimeout(() => setMapError(true), 0);
    }
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
      let isRealRoute = false;
      try {
        const res  = await fetch(
          `${OSRM}/${pickupCoords[0]},${pickupCoords[1]};${destCoords[0]},${destCoords[1]}` +
          `?overview=full&geometries=geojson`
        );
        const json = await res.json();
        const route = json.routes?.[0];
        if (route?.geometry?.coordinates?.length) {
          routeCoords = route.geometry.coordinates;
          isRealRoute = true;
          const info = {
            distanceKm: (route.distance / 1000).toFixed(1),
            durationMin: Math.ceil(route.duration / 60),
          };
          onRouteInfoChange?.(info);
        }
      } catch { onRouteInfoChange?.(null); }

      const draw = () => {
        if (m.getLayer('route-line'))        m.removeLayer('route-line');
        if (m.getLayer('route-line-border')) m.removeLayer('route-line-border');
        if (m.getSource('route'))            m.removeSource('route');

        m.addSource('route', {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } },
        });
        // A failed/timed-out OSRM call falls back to a straight line —
        // previously drawn identically to a real route, which could
        // mislead a rider/driver into thinking it's the actual road path.
        // Dashed + muted when it isn't real.
        m.addLayer({
          id: 'route-line-border', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 7 },
        });
        m.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: isRealRoute
            ? { 'line-color': '#3b82f6', 'line-width': 4 }
            : { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 2] },
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
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { longitude, latitude, accuracy } }) => {
        const coords: [number, number] = [longitude, latitude];
        placePickupMarker(coords);
        map.current?.flyTo({ center: coords, zoom: 15 });
        // A cell/wifi-based fix (no clear sky view, indoors) can be 500m+
        // off — previously used as-is with no indication to the rider that
        // the pin might be wrong.
        if (accuracy && accuracy > 100) {
          setLocationNotice('Your location may be inaccurate — drag the pin to adjust if needed.');
        }
        try {
          const res  = await fetch(
            `${NOMINATIM}/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`
          );
          const json = await res.json();
          const name = (json.display_name as string | undefined) ?? 'Current Location';
          onPickupChange(name, coords);
        } catch {
          onPickupChange('Current Location', coords);
        }
        setLocating(false);
      },
      () => {
        placePickupMarker(campusCenter);
        onPickupChange('UMPSA Campus', campusCenter);
        setLocationNotice("Couldn't get your location — using campus center. Tap the locate button to try again.");
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

  // Fallback forward-search when Google Places is unavailable (missing key,
  // quota exceeded, network error) — same Nominatim instance already used
  // for reverse-geocoding the current-location pin, just the other
  // direction. Degrades destination search instead of breaking it outright.
  const searchNominatim = async (q: string) => {
    try {
      const res  = await fetch(
        `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=my&accept-language=en`
      );
      const json = await res.json();
      const raw: GoogleSuggestion[] = (Array.isArray(json) ? json : []).map((r: any) => ({
        placeId:       String(r.place_id ?? r.osm_id ?? r.lon + ',' + r.lat),
        mainText:      (r.display_name as string ?? '').split(',')[0] ?? r.display_name ?? '',
        secondaryText: (r.display_name as string ?? '').split(',').slice(1).join(',').trim(),
        coords:        [Number(r.lon), Number(r.lat)] as [number, number],
      }));
      setSuggestions(raw);
      setShowSuggestions(raw.length > 0);
      setSearchError(raw.length === 0 ? 'No results' : null);
    } catch {
      setSuggestions([]);
      setSearchError('Search unavailable right now.');
    }
    setSearching(false);
  };

  // ── Google Places autocomplete ────────────────────────────────────────────────
  const searchPlaces = async (q: string) => {
    setSearchError(null);
    if (!GOOGLE_KEY) { await searchNominatim(q); return; }
    setSearching(true);
    try {
      const res  = await fetch(PLACES_AUTO, {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'X-Goog-Api-Key': GOOGLE_KEY,
        },
        body: JSON.stringify({
          input: q,
          languageCode: 'en',
          includedRegionCodes: ['my'],
          locationBias: {
            circle: {
              center: { latitude: campusCenter[1], longitude: campusCenter[0] },
              radius: 50000,
            },
          },
        }),
      });
      const json = await res.json();
      if (json.error) { await searchNominatim(q); return; }
      const raw: GoogleSuggestion[] = (json.suggestions ?? []).map((s: any) => ({
        placeId:       s.placePrediction?.placeId ?? '',
        mainText:      s.placePrediction?.structuredFormat?.mainText?.text ?? s.placePrediction?.text?.text ?? '',
        secondaryText: s.placePrediction?.structuredFormat?.secondaryText?.text ?? '',
      })).filter((s: GoogleSuggestion) => s.placeId);
      if (raw.length === 0) { await searchNominatim(q); return; }
      setSuggestions(raw);
      setShowSuggestions(true);
      setSearching(false);
    } catch {
      await searchNominatim(q);
    }
  };

  // ── Select a place as destination (Google or Nominatim-sourced) ──────────────
  const selectPlace = async (suggestion: GoogleSuggestion) => {
    const label = suggestion.mainText + (suggestion.secondaryText ? `, ${suggestion.secondaryText}` : '');
    setQuery(label);
    setShowSuggestions(false);

    const placeMarker = (coords: [number, number]) => {
      setDestCoords(coords);
      onDestinationChange(label, coords);
      if (destMarker.current) destMarker.current.remove();
      const el = Object.assign(document.createElement('div'), {
        className: 'w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-md',
      });
      destMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(map.current!);
    };

    // Nominatim fallback suggestions already carry coordinates — no
    // separate details lookup needed (and no Google key required either).
    if (suggestion.coords) { placeMarker(suggestion.coords); return; }

    if (!GOOGLE_KEY) return;
    setSearching(true);
    try {
      const res  = await fetch(
        `${PLACES_DET}/${suggestion.placeId}?fields=location`,
        { headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'location' } }
      );
      const json = await res.json();
      const lat: number = json.location?.latitude;
      const lng: number = json.location?.longitude;
      if (!lat || !lng) { setSearching(false); return; }
      placeMarker([lng, lat]);
    } catch { /* keep existing pins */ }
    setSearching(false);
  };

  const clearDestination = () => {
    setQuery('');
    setDestCoords(null);
    onRouteInfoChange?.(null);
    onDestinationChange('', null);
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
            placeholder="Search destination… e.g. KLCC, UMP Pekan"
            className="w-full bg-white border border-slate-100 rounded-2xl py-3 pl-10 pr-9 text-sm font-semibold text-slate-700 placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-primary transition"
            style={{ fontSize: '16px' }}
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

        {/* Debug error */}
        {searchError && !showSuggestions && (
          <p className="text-xs text-red-500 font-normal px-1 mt-1">{searchError}</p>
        )}
        {locationNotice && (
          <p className="text-xs text-amber-600 font-normal px-1 mt-1">{locationNotice}</p>
        )}

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="max-h-52 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button key={s.placeId} type="button" onClick={() => selectPlace(s)}
                  className={`w-full text-left px-4 py-3 transition hover:bg-slate-50 ${
                    i < suggestions.length - 1 ? 'border-b border-slate-50' : ''
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-800 truncate">{s.mainText}</p>
                  {s.secondaryText && (
                    <p className="text-xs text-slate-400 font-normal truncate mt-0.5">{s.secondaryText}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-100" style={{ height: 260 }}>
        <div ref={mapContainer} className="w-full h-full" />
        {mapError && (
          <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center gap-1.5 px-6 text-center">
            <p className="text-xs font-semibold text-slate-600">Map unavailable on this device</p>
            <p className="text-xs text-slate-400 font-normal">Try Quick or Custom booking instead.</p>
          </div>
        )}
        <button type="button" onClick={locateUser} disabled={locating}
          className="absolute top-3 right-3 z-10 w-9 h-9 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:text-primary transition active:scale-90 disabled:opacity-50"
        >
          {locating
            ? <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            : <LocateFixed className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
