import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useApp } from '../context/AppContext';

const COORDS: Record<string, [number, number]> = {
  'Kolej Kediaman Pertama (KK1)':                [103.1658, 3.7478],
  'Kolej Kediaman Ketiga (KK3)':                 [103.1642, 3.7465],
  'Fakulti Sains Komputer & Teknologi Maklumat': [103.1695, 3.7440],
  'Dewan Peperiksaan Utama':                     [103.1718, 3.7425],
  'Perpustakaan Sentral':                        [103.1705, 3.7448],
  'Pusat Sukan':                                 [103.1670, 3.7415],
};

// Off-campus spawn point for the driver (Gambang town area)
const DRIVER_SPAWN: [number, number] = [103.1750, 3.7510];

// Slightly under the 6-second stage timer so animation completes before next stage
const ANIM_MS = 5300;

function buildCurvedRoute(a: [number, number], b: [number, number], steps = 60): [number, number][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  // Perpendicular offset to create a gentle curve
  const mid: [number, number] = [(a[0] + b[0]) / 2 - dy * 0.3, (a[1] + b[1]) / 2 + dx * 0.3];
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([
      (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * mid[0] + t ** 2 * b[0],
      (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * mid[1] + t ** 2 * b[1],
    ]);
  }
  return pts;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const makeCarEl = (): HTMLElement => {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:42px', 'height:42px', 'background:#10B981', 'border-radius:50%',
    'display:flex', 'align-items:center', 'justify-content:center',
    'border:3px solid white', 'box-shadow:0 4px 14px rgba(16,185,129,0.55)',
    'transition:transform 0.2s',
  ].join(';');
  el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 17H3v-4l2-6h14l2 6v4h-2"/>
    <circle cx="7.5" cy="17.5" r="1.5" fill="white" stroke="none"/>
    <circle cx="16.5" cy="17.5" r="1.5" fill="white" stroke="none"/>
  </svg>`;
  return el;
};

const makePickupEl = (pulse = false): HTMLElement => {
  const el = document.createElement('div');
  if (pulse) {
    el.style.cssText = 'width:22px;height:22px;position:relative;';
    el.innerHTML = `
      <style>@keyframes gpulse{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.5)}60%{box-shadow:0 0 0 12px rgba(59,130,246,0)}}</style>
      <div style="width:22px;height:22px;background:#3B82F6;border-radius:50%;border:3px solid white;animation:gpulse 1.6s ease-out infinite;"></div>
    `;
  } else {
    el.style.cssText = [
      'width:22px', 'height:22px', 'background:#3B82F6', 'border-radius:50%',
      'border:3px solid white', 'box-shadow:0 2px 8px rgba(59,130,246,.45)',
    ].join(';');
  }
  return el;
};

const makeDestEl = (): HTMLElement => {
  const el = document.createElement('div');
  el.style.cssText = 'width:28px;height:36px;';
  el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22S28 23.5 28 14C28 6.27 21.73 0 14 0z" fill="#EF4444"/>
    <circle cx="14" cy="14" r="6.5" fill="white"/>
    <circle cx="14" cy="14" r="3" fill="#EF4444"/>
  </svg>`;
  return el;
};

const STATUS_LABEL: Record<string, string> = {
  searching: 'Finding your driver...',
  assigned:  'Driver assigned — on the way',
  arriving:  'Driver is approaching',
  active:    'Trip in progress',
};

const makeUserDotEl = (): HTMLElement => {
  const el = document.createElement('div');
  el.style.cssText = 'width:20px;height:20px;position:relative;';
  el.innerHTML = `
    <style>@keyframes upulse{0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,.5)}60%{box-shadow:0 0 0 14px rgba(59,130,246,0)}}</style>
    <div style="width:20px;height:20px;background:#3B82F6;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(59,130,246,.5);animation:upulse 2s ease-out infinite;"></div>
  `;
  return el;
};

export const MapLibre: React.FC = () => {
  const { activeRide } = useApp();

  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const carRef        = useRef<maplibregl.Marker | null>(null);
  const pickupRef     = useRef<maplibregl.Marker | null>(null);
  const destRef       = useRef<maplibregl.Marker | null>(null);
  const rafRef        = useRef<number | null>(null);
  const t0Ref         = useRef<number>(0);
  const userDotRef    = useRef<maplibregl.Marker | null>(null);
  const userPosRef    = useRef<[number, number] | null>(null);
  const watchIdRef    = useRef<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // One-time map init + GPS watch
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [103.1688, 3.7450],
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;

    // Start GPS watch
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          userPosRef.current = coords;
          setGpsError(null);
          if (!userDotRef.current) {
            userDotRef.current = new maplibregl.Marker({ element: makeUserDotEl(), anchor: 'center' })
              .setLngLat(coords)
              .addTo(map);
          } else {
            userDotRef.current.setLngLat(coords);
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setGpsError('denied');
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      map.remove();
    };
  }, []);

  // React to ride state changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    const clearMarkers = () => {
      carRef.current?.remove();    carRef.current = null;
      pickupRef.current?.remove(); pickupRef.current = null;
      destRef.current?.remove();   destRef.current = null;
    };

    const clearRoute = () => {
      if (map.getLayer('route')) map.removeLayer('route');
      if (map.getSource('route')) map.removeSource('route');
    };

    const setRoute = (coords: [number, number][]) => {
      const data = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } };
      if (map.getSource('route')) {
        (map.getSource('route') as maplibregl.GeoJSONSource).setData(data as any);
      } else if (map.isStyleLoaded()) {
        map.addSource('route', { type: 'geojson', data: data as any });
        map.addLayer({
          id: 'route', type: 'line', source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#10B981', 'line-width': 5, 'line-opacity': 0.85 },
        });
      }
    };

    const placeBaseMarkers = (pulse: boolean, pCoord: [number, number], dCoord: [number, number]) => {
      pickupRef.current?.remove();
      destRef.current?.remove();
      pickupRef.current = new maplibregl.Marker({ element: makePickupEl(pulse), anchor: 'center' })
        .setLngLat(pCoord).addTo(map);
      destRef.current = new maplibregl.Marker({ element: makeDestEl(), anchor: 'bottom', offset: [0, 4] })
        .setLngLat(dCoord).addTo(map);
      const run = () => setRoute(buildCurvedRoute(pCoord, dCoord));
      if (map.isStyleLoaded()) run(); else map.once('load', run);
    };

    const animateAlong = (route: [number, number][]) => {
      t0Ref.current = performance.now();
      const tick = (now: number) => {
        const t = easeInOut(Math.min((now - t0Ref.current) / ANIM_MS, 1));
        const idx = Math.round(t * (route.length - 1));
        const pos = route[idx];
        carRef.current?.setLngLat(pos);
        map.easeTo({ center: pos, duration: 120 });
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (!activeRide) {
      clearMarkers();
      if (map.isStyleLoaded()) clearRoute(); else map.once('load', clearRoute);
      map.easeTo({ center: [103.1688, 3.7450], zoom: 15, duration: 800 });
      return;
    }

    const { pickup, destination, status } = activeRide;
    const pCoord = COORDS[pickup];
    const dCoord = COORDS[destination];
    if (!pCoord || !dCoord) return;

    if (status === 'searching') {
      placeBaseMarkers(true, pCoord, dCoord);
      if (!carRef.current) {
        carRef.current = new maplibregl.Marker({ element: makeCarEl(), anchor: 'center' })
          .setLngLat(DRIVER_SPAWN).addTo(map);
      }
      const b = new maplibregl.LngLatBounds().extend(pCoord).extend(dCoord);
      map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 800 });
    }

    else if (status === 'assigned') {
      placeBaseMarkers(false, pCoord, dCoord);
      if (!carRef.current) {
        carRef.current = new maplibregl.Marker({ element: makeCarEl(), anchor: 'center' })
          .setLngLat(DRIVER_SPAWN).addTo(map);
      }
      const b = new maplibregl.LngLatBounds().extend(pCoord).extend(dCoord).extend(DRIVER_SPAWN);
      map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 600 });
    }

    else if (status === 'arriving') {
      placeBaseMarkers(false, pCoord, dCoord);
      const fromPos = carRef.current
        ? (carRef.current.getLngLat().toArray() as [number, number])
        : DRIVER_SPAWN;
      if (!carRef.current) {
        carRef.current = new maplibregl.Marker({ element: makeCarEl(), anchor: 'center' })
          .setLngLat(fromPos).addTo(map);
      }
      animateAlong(buildCurvedRoute(fromPos, pCoord));
    }

    else if (status === 'active') {
      placeBaseMarkers(false, pCoord, dCoord);
      if (!carRef.current) {
        carRef.current = new maplibregl.Marker({ element: makeCarEl(), anchor: 'center' })
          .setLngLat(pCoord).addTo(map);
      } else {
        carRef.current.setLngLat(pCoord);
      }
      animateAlong(buildCurvedRoute(pCoord, dCoord));
    }

  }, [activeRide?.status, activeRide?.pickup, activeRide?.destination]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
      <div ref={containerRef} className="w-full h-[360px]" />

      {/* Grab-style status pill */}
      {activeRide && activeRide.status !== 'completed' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-md border border-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap">
            {STATUS_LABEL[activeRide.status]}
          </div>
        </div>
      )}

      {/* Locate-me button */}
      <button
        onClick={() => {
          if (userPosRef.current) {
            mapRef.current?.easeTo({ center: userPosRef.current, zoom: 16, duration: 600 });
          } else {
            mapRef.current?.easeTo({ center: [103.1688, 3.7450], zoom: 15, duration: 600 });
          }
        }}
        className="absolute bottom-12 right-3 z-10 w-9 h-9 bg-white rounded-lg shadow-md border border-slate-100 flex items-center justify-center text-slate-500 hover:text-primary transition"
        title="Go to my location"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      </button>

      {/* GPS denied warning */}
      {gpsError === 'denied' && (
        <div className="absolute bottom-3 left-3 right-14 z-10 bg-white/90 backdrop-blur-sm border border-amber-200 text-amber-700 text-xs font-bold rounded-lg px-3 py-1.5">
          Location access denied. Enable GPS in browser settings.
        </div>
      )}
    </div>
  );
};
