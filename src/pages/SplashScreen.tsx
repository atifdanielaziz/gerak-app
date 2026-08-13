import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

export const SplashScreen: React.FC = () => {
  const { setCurrentPage, deepLinkPage } = useApp();
  const [phase, setPhase] = useState<'enter' | 'idle' | 'exit'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('idle'),  400);
    const t2 = setTimeout(() => setPhase('exit'),  2000);
    const t3 = setTimeout(() => setCurrentPage(deepLinkPage ?? 'dashboard'), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [setCurrentPage, deepLinkPage]);

  return (
    <div className="flex-1 bg-white flex flex-col items-center justify-center select-none h-full relative overflow-hidden">

      {/* Logo block */}
      <div
        style={{
          opacity:    phase === 'enter' ? 0 : 1,
          transform:  phase === 'enter' ? 'scale(0.88) translateY(12px)' : 'scale(1) translateY(0)',
          transition: 'opacity 0.5s ease-out, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)',
        }}
        className="flex flex-col items-center gap-3"
      >
        <img src="/gerak-symbol.png" alt="Gerak" className="w-48 h-auto" />

        <p className="text-slate-400 font-normal text-xs m-0">
          Smart Campus Platform
        </p>

        {/* Loading dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#EF4444',
                opacity: phase === 'idle' ? 1 : 0.2,
                animation: phase === 'idle' ? `dot-bounce 1.2s ${i * 0.2}s ease-in-out infinite` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Red circle burst on exit */}
      <div
        style={{
          position:        'absolute',
          inset:           0,
          backgroundColor: '#EF4444',
          clipPath:        phase === 'exit' ? 'circle(150% at 50% 50%)' : 'circle(0% at 50% 50%)',
          transition:      phase === 'exit' ? 'clip-path 0.6s cubic-bezier(0.4,0,0.2,1)' : 'none',
          zIndex:          50,
        }}
      />

      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
