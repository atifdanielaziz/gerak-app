import React, { useRef, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface PinLocation {
  address: string;
  coords: [number, number];
}

interface Props {
  center: [number, number];
  activePin: 'pickup' | 'destination';
  onPickup: (loc: PinLocation) => void;
  onDestination: (loc: PinLocation) => void;
}

async function reverseGeocode(lng: number, lat: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17`,
      { headers: { 'User-Agent': 'GerakApp/1.0', 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    const name = d.name ?? '';
    const road = d.address?.road ?? '';
    const area = d.address?.suburb ?? d.address?.city_district ?? '';
    const parts = [name, road, area].filter(Boolean);
    if (parts.length) return parts.join(', ');
    return d.display_name?.split(',').slice(0, 3).join(',').trim()
      || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

const makeBluePin = (): HTMLElement => {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:22px', 'height:22px', 'background:#3B82F6', 'border-radius:50%',
    'border:3px solid white', 'box-shadow:0 2px 10px rgba(59,130,246,.55)',
  ].join(';');
  return el;
};

const makeRedPin = (): HTMLElement => {
  const el = document.createElement('div');
  el.style.cssText = 'width:28px;height:36px;';
  el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 22 14 22S28 23.5 28 14C28 6.27 21.73 0 14 0z" fill="#EF4444"/>
    <circle cx="14" cy="14" r="6.5" fill="white"/>
    <circle cx="14" cy="14" r="3" fill="#EF4444"/>
  </svg>`;
  return el;
};

export const MapPicker: React.FC<Props> = ({ center, activePin, onPickup, onDestination }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const pickupRef     = useRef<maplibregl.Marker | null>(null);
  const destRef       = useRef<maplibregl.Marker | null>(null);
  const activePinRef  = useRef(activePin);
  const onPickupRef   = useRef(onPickup);
  const onDestRef     = useRef(onDestination);

  useEffect(() => { activePinRef.current = activePin; }, [activePin]);
  useEffect(() => { onPickupRef.current = onPickup; }, [onPickup]);
  useEffect(() => { onDestRef.current = onDestination; }, [onDestination]);

  // One-time map init
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center,
      zoom: 15,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.getCanvas().style.cursor = 'crosshair';
    mapRef.current = map;

    map.on('click', async (e) => {
      const { lng, lat } = e.lngLat;
      const coords: [number, number] = [lng, lat];
      const address = await reverseGeocode(lng, lat);
      if (activePinRef.current === 'pickup') {
        pickupRef.current?.remove();
        pickupRef.current = new maplibregl.Marker({ element: makeBluePin(), anchor: 'center' })
          .setLngLat(coords).addTo(map);
        onPickupRef.current({ address, coords });
      } else {
        destRef.current?.remove();
        destRef.current = new maplibregl.Marker({ element: makeRedPin(), anchor: 'bottom', offset: [0, 4] })
          .setLngLat(coords).addTo(map);
        onDestRef.current({ address, coords });
      }
    });

    return () => {
      pickupRef.current?.remove();
      destRef.current?.remove();
      map.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-center when campus changes
  useEffect(() => {
    mapRef.current?.flyTo({ center, zoom: 15, duration: 800 });
  }, [center[0], center[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
      <div ref={containerRef} className="w-full h-[280px]" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-10">
        <div className={`rounded-full px-4 py-1.5 shadow-md text-xs font-bold whitespace-nowrap ${
          activePin === 'pickup'
            ? 'bg-blue-600 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {activePin === 'pickup' ? 'Tap map to set pickup' : 'Tap map to set destination'}
        </div>
      </div>
    </div>
  );
};
