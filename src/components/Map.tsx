import React, { useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

interface Landmark {
  name: string;
  x: number;
  y: number;
  type: 'dorm' | 'faculty' | 'facility';
}

const LANDMARKS: Record<string, Landmark> = {
  'Kolej Kediaman Pertama (KK1)': { name: 'KK1 Dorms', x: 80, y: 320, type: 'dorm' },
  'Kolej Kediaman Ketiga (KK3)': { name: 'KK3 Dorms', x: 80, y: 120, type: 'dorm' },
  'Fakulti Sains Komputer & Teknologi Maklumat': { name: 'Computer Science Faculty', x: 220, y: 110, type: 'faculty' },
  'Dewan Peperiksaan Utama': { name: 'Main Exam Hall', x: 340, y: 160, type: 'facility' },
  'Perpustakaan Sentral': { name: 'Central Library', x: 320, y: 290, type: 'facility' },
  'Pusat Sukan': { name: 'Sports Complex', x: 180, y: 220, type: 'facility' },
};

export const Map: React.FC = () => {
  const { activeRide } = useApp();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Vehicle and simulation states
  const simState = useRef({
    carX: 0,
    carY: 0,
    progress: 0, // 0 to 1
    heading: 0,
    pulseTime: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Standard high-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 400 * dpr;
    canvas.height = 360 * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = '100%';
    canvas.style.height = '360px';

    const getCoords = (name: string) => {
      const landmark = LANDMARKS[name];
      return landmark ? { x: landmark.x, y: landmark.y } : { x: 200, y: 180 };
    };

    const render = () => {
      // Clear Canvas
      ctx.fillStyle = '#E8F5E9'; // Soft green light campus base
      ctx.fillRect(0, 0, 400, 360);

      // 1. Draw Forest/Green Zones
      ctx.fillStyle = '#C8E6C9';
      ctx.beginPath();
      ctx.arc(60, 60, 50, 0, Math.PI * 2);
      ctx.arc(320, 70, 40, 0, Math.PI * 2);
      ctx.arc(150, 300, 60, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw Campus Lake / Water Features
      ctx.fillStyle = '#B3E5FC';
      ctx.beginPath();
      ctx.ellipse(250, 200, 40, 25, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#81D4FA';
      ctx.stroke();

      // 3. Draw Road Grid (Grey Paths)
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw road segments linking landmarks
      const roads = [
        // Ring road outer
        [[80, 120], [220, 110], [340, 160], [320, 290], [80, 320], [80, 120]],
        // Connectors inside
        [[80, 220], [180, 220], [250, 200]],
        [[220, 110], [180, 220], [320, 290]],
        [[80, 320], [180, 220]]
      ];

      roads.forEach(path => {
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i][0], path[i][1]);
        }
        ctx.stroke();
      });

      // Draw road markings (dotted lines)
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.setLineDash([4, 6]);
      roads.forEach(path => {
        ctx.beginPath();
        ctx.moveTo(path[0][0], path[0][1]);
        for (let i = 1; i < path.length; i++) {
          ctx.lineTo(path[i][0], path[i][1]);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]); // Reset dash

      // 4. Draw Landmarks (Buildings)
      Object.entries(LANDMARKS).forEach(([_, lm]) => {
        // Draw building card
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.beginPath();
        ctx.roundRect(lm.x - 24, lm.y - 12, 48, 16, 4);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset shadow
        ctx.shadowOffsetY = 0;

        // Border colored by type
        ctx.strokeStyle = lm.type === 'dorm' ? '#3B82F6' : lm.type === 'faculty' ? '#10B981' : '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label text
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(lm.name, lm.x, lm.y - 2);
      });

      // 5. Active Ride Layer (Pins & Moving Car)
      if (activeRide) {
        const start = getCoords(activeRide.pickup);
        const end = getCoords(activeRide.destination);

        // A. Draw Route Guide line (Dashed green line)
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // B. Pulsing Pickup Pin
        simState.current.pulseTime += 0.05;
        const pulse = 6 + Math.sin(simState.current.pulseTime) * 3;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // Blue pickup halo
        ctx.beginPath();
        ctx.arc(start.x, start.y, pulse + 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // C. Glowing Destination Pin
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // Red destination halo
        ctx.beginPath();
        ctx.arc(end.x, end.y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // D. Calculate and draw moving driver car
        const status = activeRide.status;
        let carX = start.x;
        let carY = start.y;
        let heading = 0;

        if (status === 'searching') {
          // Spinner around pickup representing driver searching
          ctx.strokeStyle = '#10B981';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(start.x, start.y, 25, simState.current.pulseTime, simState.current.pulseTime + Math.PI * 0.7);
          ctx.stroke();
        } else {
          // Driver exists - calculate position based on stage
          let progress = 0;
          let fromPt = { x: 0, y: 0 };
          let toPt = { x: 0, y: 0 };

          if (status === 'assigned') {
            // Driver far away (spawning near KK3, coming to pickup)
            fromPt = { x: 80, y: 120 };
            toPt = start;
            progress = 0.3;
          } else if (status === 'arriving') {
            // Driver closing in on pickup
            fromPt = { x: 80, y: 120 };
            toPt = start;
            progress = 0.8;
          } else if (status === 'active') {
            // In transit: pickup to destination
            fromPt = start;
            toPt = end;
            progress = 0.55;
          } else if (status === 'completed') {
            fromPt = start;
            toPt = end;
            progress = 1.0;
          }

          // Interpolate
          carX = fromPt.x + (toPt.x - fromPt.x) * progress;
          carY = fromPt.y + (toPt.y - fromPt.y) * progress;
          heading = Math.atan2(toPt.y - fromPt.y, toPt.x - fromPt.x);

          // Draw active vehicle (Sleek Grab Car shape)
          ctx.save();
          ctx.translate(carX, carY);
          ctx.rotate(heading);

          // Car shadow
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.beginPath();
          ctx.roundRect(-10, -5, 20, 10, 3);
          ctx.fill();

          // Car body (Bright emerald green)
          ctx.fillStyle = '#10B981';
          ctx.beginPath();
          ctx.roundRect(-8, -4, 16, 8, 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Headlights
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(6, -3, 2, 1.5);
          ctx.fillRect(6, 1.5, 2, 1.5);

          // Windshield (Black glass)
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-2, -3, 4, 6);

          ctx.restore();
        }
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [activeRide]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-100 shadow-inner bg-slate-50">
      <canvas ref={canvasRef} className="block w-full h-[360px]" />
      
      {/* Dynamic Watermark HUD overlay */}
      <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-xs border border-slate-100 rounded-lg px-2 py-1 text-[8px] font-bold text-slate-500 shadow-xs flex items-center gap-1.5 pointer-events-none">
        <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
        LIVE CAMPUS GRID (KAMPUS PERDANA)
      </div>

      {activeRide && (
        <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-xs border border-slate-100 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-md flex flex-col gap-0.5">
          <div className="text-primary flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary" />
            Active Route
          </div>
          <div>Pickup: <span className="text-slate-500 font-semibold">{activeRide.pickup.split(' (')[0]}</span></div>
          <div>Dest: <span className="text-slate-500 font-semibold">{activeRide.destination.split(' (')[0]}</span></div>
        </div>
      )}
    </div>
  );
};
