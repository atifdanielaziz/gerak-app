import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Navigation } from 'lucide-react';
import { useApp } from '../context/AppContext';

type LatLng = { lat: number; lng: number };

declare global {
  interface Window {
    google?: any;
    initGerakGoogleMaps?: () => void;
  }
}

const GOOGLE_MAPS_SRC = 'https://maps.googleapis.com/maps/api/js';
const CAMPUS_CENTER: LatLng = { lat: 3.139, lng: 101.6869 };
const DRIVER_SPAWN: LatLng = { lat: 3.1418, lng: 101.6912 };
const ANIM_MS = 5300;

const COORDS: Record<string, LatLng> = {
  'Kolej Kediaman Pertama (KK1)': { lat: 3.1398, lng: 101.6835 },
  'Kolej Kediaman Ketiga (KK3)': { lat: 3.1382, lng: 101.6820 },
  'Fakulti Sains Komputer & Teknologi Maklumat': { lat: 3.1405, lng: 101.6870 },
  'Dewan Peperiksaan Utama': { lat: 3.1370, lng: 101.6895 },
  'Perpustakaan Sentral': { lat: 3.1385, lng: 101.6880 },
  'Pusat Sukan': { lat: 3.1365, lng: 101.6845 },
};

const STATUS_LABEL: Record<string, string> = {
  searching: 'Finding your driver...',
  assigned: 'Driver assigned',
  arriving: 'Driver approaching pickup',
  active: 'Trip in progress',
};

const mapStyle = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

let mapsLoader: Promise<void> | null = null;

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gerak-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Google Maps failed to load.')));
      return;
    }

    window.initGerakGoogleMaps = () => resolve();
    const script = document.createElement('script');
    script.dataset.gerakGoogleMaps = 'true';
    script.async = true;
    script.defer = true;
    script.src = `${GOOGLE_MAPS_SRC}?key=${encodeURIComponent(apiKey)}&callback=initGerakGoogleMaps`;
    script.onerror = () => reject(new Error('Google Maps failed to load.'));
    document.head.appendChild(script);
  });

  return mapsLoader;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function buildCurvedRoute(a: LatLng, b: LatLng, steps = 70): LatLng[] {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const mid = {
    lng: (a.lng + b.lng) / 2 - dy * 0.3,
    lat: (a.lat + b.lat) / 2 + dx * 0.3,
  };
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return {
      lng: (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * mid.lng + t ** 2 * b.lng,
      lat: (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mid.lat + t ** 2 * b.lat,
    };
  });
}

function makeCarIcon(googleMaps: any) {
  return {
    path: 'M20 12h-2.1l-1.6-4.1A3 3 0 0 0 13.5 6h-3A3 3 0 0 0 7.7 7.9L6.1 12H4a1 1 0 0 0-1 1v4h2a2 2 0 1 0 4 0h6a2 2 0 1 0 4 0h2v-4a1 1 0 0 0-1-1ZM9.6 8h4.8l1.2 3H8.4L9.6 8Z',
    fillColor: '#ef4444',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 1.45,
    anchor: new googleMaps.Point(12, 12),
  };
}

function createMarker(map: any, position: LatLng, options: Record<string, unknown>) {
  return new window.google.maps.Marker({
    map,
    position,
    optimized: true,
    ...options,
  });
}

export const GoogleRideMap: React.FC = () => {
  const { activeRide } = useApp();
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const directionsRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const carMarkerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);
  const userPosRef = useRef<LatLng | null>(null);
  const rafRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [gpsError, setGpsError] = useState('');

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey)
      .then(() => setReady(true))
      .catch((error: Error) => setLoadError(error.message));
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const googleMaps = window.google.maps;
    const map = new googleMaps.Map(containerRef.current, {
      center: CAMPUS_CENTER,
      zoom: 15,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      styles: mapStyle,
    });

    mapRef.current = map;
    directionsRef.current = new googleMaps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: '#ef4444',
        strokeOpacity: 0.92,
        strokeWeight: 6,
      },
    });

    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const nextPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          userPosRef.current = nextPosition;
          setGpsError('');

          if (!userMarkerRef.current) {
            userMarkerRef.current = createMarker(map, nextPosition, {
              title: 'Your GPS location',
              icon: {
                path: googleMaps.SymbolPath.CIRCLE,
                fillColor: '#2563eb',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 4,
                scale: 8,
              },
            });
          } else {
            userMarkerRef.current.setPosition(nextPosition);
          }
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            setGpsError('Location permission denied.');
          } else {
            setGpsError('Unable to read GPS location.');
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const googleMaps = window.google.maps;
    const map = mapRef.current;
    const directionsRenderer = directionsRef.current;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const clearRideLayer = () => {
      pickupMarkerRef.current?.setMap(null);
      destMarkerRef.current?.setMap(null);
      carMarkerRef.current?.setMap(null);
      routeLineRef.current?.setMap(null);
      pickupMarkerRef.current = null;
      destMarkerRef.current = null;
      carMarkerRef.current = null;
      routeLineRef.current = null;
      directionsRenderer?.setDirections({ routes: [] });
    };

    const fitTo = (points: LatLng[]) => {
      const bounds = new googleMaps.LatLngBounds();
      points.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 64);
    };

    const setFallbackRoute = (points: LatLng[]) => {
      routeLineRef.current?.setMap(null);
      routeLineRef.current = new googleMaps.Polyline({
        map,
        path: points,
        strokeColor: '#ef4444',
        strokeOpacity: 0.9,
        strokeWeight: 6,
      });
    };

    const drawDirections = (origin: LatLng, destination: LatLng) => {
      const directionsService = new googleMaps.DirectionsService();
      directionsService.route(
        {
          origin,
          destination,
          travelMode: googleMaps.TravelMode.DRIVING,
        },
        (result: unknown, status: string) => {
          if (status === 'OK') {
            routeLineRef.current?.setMap(null);
            directionsRenderer.setDirections(result);
          } else {
            setFallbackRoute(buildCurvedRoute(origin, destination));
          }
        },
      );
    };

    const animateCar = (path: LatLng[]) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = easeInOut(Math.min((now - startedAt) / ANIM_MS, 1));
        const index = Math.round(progress * (path.length - 1));
        const position = path[index];

        carMarkerRef.current?.setPosition(position);
        map.panTo(position);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (!activeRide) {
      clearRideLayer();
      map.panTo(CAMPUS_CENTER);
      map.setZoom(15);
      return;
    }

    clearRideLayer();

    const pickup = COORDS[activeRide.pickup];
    const destination = COORDS[activeRide.destination];
    if (!pickup || !destination) return;

    pickupMarkerRef.current = createMarker(map, pickup, {
      title: activeRide.pickup,
      label: { text: 'P', color: '#ffffff', fontWeight: '800' },
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        fillColor: '#2563eb',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 4,
        scale: 11,
      },
    });

    destMarkerRef.current = createMarker(map, destination, {
      title: activeRide.destination,
      label: { text: 'D', color: '#ffffff', fontWeight: '800' },
      icon: {
        path: googleMaps.SymbolPath.CIRCLE,
        fillColor: '#111827',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 4,
        scale: 11,
      },
    });

    const carStart = activeRide.status === 'active' ? pickup : DRIVER_SPAWN;
    carMarkerRef.current = createMarker(map, carStart, {
      title: activeRide.driver?.vehicle ?? 'Gerak driver',
      icon: makeCarIcon(googleMaps),
      zIndex: 10,
    });

    if (activeRide.status === 'searching') {
      setFallbackRoute(buildCurvedRoute(pickup, destination));
      fitTo([pickup, destination, DRIVER_SPAWN]);
    } else if (activeRide.status === 'assigned') {
      drawDirections(DRIVER_SPAWN, pickup);
      fitTo([pickup, DRIVER_SPAWN]);
    } else if (activeRide.status === 'arriving') {
      const path = buildCurvedRoute(DRIVER_SPAWN, pickup);
      setFallbackRoute(path);
      fitTo([pickup, DRIVER_SPAWN]);
      animateCar(path);
    } else if (activeRide.status === 'active') {
      const path = buildCurvedRoute(pickup, destination);
      drawDirections(pickup, destination);
      fitTo([pickup, destination]);
      animateCar(path);
    }
  }, [activeRide?.destination, activeRide?.pickup, activeRide?.status, ready]);

  if (!apiKey) {
    return (
      <div className="h-[360px] rounded-2xl border border-dashed border-slate-200 bg-white p-5 flex flex-col justify-center gap-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-50 text-primary flex items-center justify-center">
          <MapPin className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-800">Google Maps key required</h3>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed mt-1">
            Add VITE_GOOGLE_MAPS_API_KEY to your local environment, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="h-[360px] rounded-2xl border border-red-100 bg-red-50 p-5 flex items-center justify-center text-center">
        <p className="text-xs font-bold text-red-600">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-100">
      <div ref={containerRef} className="w-full h-[360px]" />

      {activeRide && activeRide.status !== 'completed' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
          <div className="bg-white/95 backdrop-blur-sm rounded-full px-4 py-1.5 shadow-md border border-slate-100 text-xs font-black text-slate-700 whitespace-nowrap">
            {STATUS_LABEL[activeRide.status]}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          const map = mapRef.current;
          const position = userPosRef.current ?? CAMPUS_CENTER;
          map?.panTo(position);
          map?.setZoom(16);
        }}
        className="absolute bottom-12 right-3 z-10 w-10 h-10 bg-white rounded-xl shadow-md border border-slate-100 flex items-center justify-center text-slate-600 hover:text-primary active:scale-95 transition"
        title="Go to my location"
      >
        <LocateFixed className="w-5 h-5" />
      </button>

      {gpsError && (
        <div className="absolute bottom-3 left-3 right-16 z-10 bg-white/95 backdrop-blur-sm border border-amber-200 text-amber-700 text-xs font-bold rounded-xl px-3 py-2">
          {gpsError}
        </div>
      )}

      {!activeRide && (
        <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-sm border border-slate-100 text-slate-600 text-xs font-bold rounded-xl px-3 py-2 flex items-center gap-1.5 shadow-sm">
          <Navigation className="w-3.5 h-3.5 text-primary" />
          Live GPS ready
        </div>
      )}
    </div>
  );
};
