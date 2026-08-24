import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// sw.js calls skipWaiting()+clients.claim() on every install, so a new
// version activates almost immediately — but a tab that's already open
// keeps running its OLD JS bundle regardless, now against a service worker
// built for a possibly different one. controllerchange fires exactly at
// that mismatch. This used to be a bare window.confirm(), which is jarring
// and blocks the whole page; this renders the same prompt as an in-app
// drawer instead. The module-level flag stops a second controllerchange
// (e.g. two deploys landing close together) from stacking a second prompt
// on top of one already showing in the same tab.
let promptShown = false;

export const UpdatePrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const reloading = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = () => {
      if (promptShown || reloading.current) return;
      promptShown = true;
      setShow(true);
    };
    navigator.serviceWorker.addEventListener('controllerchange', handler);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handler);
  }, []);

  const reload = () => {
    reloading.current = true;
    window.location.reload();
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
    >
      <div
        className="w-full bg-white rounded-t-3xl shadow-2xl animate-slide-up overflow-hidden"
        style={{ maxWidth: 480, paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="px-6 pt-4 pb-2 flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-800 mb-1">A new version of Gerak is ready</p>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed">
              Reload to get the latest fixes and features.
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-6 pt-3 pb-2">
          <button onClick={() => setShow(false)}
            className="flex-1 bg-slate-100 text-slate-600 font-extrabold text-sm py-3.5 rounded-2xl active:scale-95 transition">
            Later
          </button>
          <button onClick={reload}
            className="flex-1 bg-primary text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-lg shadow-primary/25 active:scale-95 transition">
            Reload Now
          </button>
        </div>
      </div>
    </div>
  );
};
