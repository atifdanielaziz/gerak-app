import { useEffect, useState } from 'react';
import { PlayCircle, Play, X, VideoOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { JUBAH_TUTORIALS, getJubahTutorial, jubahTutorialUrl, type JubahTutorial, type JubahTutorialKey } from '../lib/jubahTutorials';

// Floating Message Standard — centered card + heavy-blur backdrop, same as
// JubahQrButton's preview. The <video> only mounts while open, so nothing
// is downloaded until the customer actually taps a tutorial.
function TutorialPlayer({ tutorial, onClose }: { tutorial: JubahTutorial; onClose: () => void }) {
  const { setSheetOpen } = useApp();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSheetOpen(true);
    return () => setSheetOpen(false);
  }, [setSheetOpen]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      onPointerDown={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        className="w-full max-w-[360px] max-h-[calc(100dvh-5rem)] bg-white border border-slate-100 rounded-3xl flex flex-col overflow-hidden"
        onPointerDown={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100 shrink-0">
          <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5 min-w-0">
            <PlayCircle className="w-4 h-4 shrink-0" /> <span className="truncate">{tutorial.title}</span>
          </span>
          <button onClick={onClose} aria-label="Close video" className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 active:scale-90 transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-slate-900 flex items-center justify-center min-h-0">
          {!failed ? (
            <video
              src={jubahTutorialUrl(tutorial)}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
              className="w-full max-h-[calc(100dvh-10rem)] aspect-[9/16] object-contain block"
            />
          ) : (
            <div className="w-full aspect-[9/16] max-h-[60dvh] flex flex-col items-center justify-center gap-2 text-slate-400 p-6 text-center">
              <VideoOff className="w-8 h-8" />
              <span className="text-xs font-semibold">This video isn't available right now. Please try again later.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface JubahTutorialListProps {
  keys?: JubahTutorialKey[];
  /** Selected university key — hides UMPSA-only videos once another university is chosen. */
  university?: string;
}

// Card listing tutorials as tappable rows. Default is every tutorial.
export function JubahTutorialList({ keys, university }: JubahTutorialListProps) {
  const [playing, setPlaying] = useState<JubahTutorial | null>(null);
  const list = JUBAH_TUTORIALS
    .filter(t => !keys || keys.includes(t.key))
    .filter(t => !t.umpsaOnly || !university || university === 'umpsa');

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 m-0">
          <PlayCircle className="w-4 h-4" /> Video Guides
        </h3>
        <div className="flex flex-col gap-2">
          {list.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPlaying(t)}
              className="w-full flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2.5 active:bg-slate-100 active:scale-[0.99] transition text-left"
            >
              <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Play className="w-3.5 h-3.5 fill-current" />
              </span>
              <span className="flex-1 min-w-0 text-xs font-semibold text-slate-700">{t.title}</span>
              <span className="text-xs font-normal text-slate-400 shrink-0">{t.duration}</span>
            </button>
          ))}
        </div>
      </div>
      {playing && <TutorialPlayer tutorial={playing} onClose={() => setPlaying(null)} />}
    </>
  );
}

// Single inline "▶ Watch" link, for placing one tutorial right where it's needed.
export function JubahTutorialLink({ tutorialKey, label, className = '' }: { tutorialKey: JubahTutorialKey; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const tutorial = getJubahTutorial(tutorialKey);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 active:scale-95 transition ${className}`}
      >
        <PlayCircle className="w-3.5 h-3.5" /> {label ?? `Watch: ${tutorial.title}`}
      </button>
      {open && <TutorialPlayer tutorial={tutorial} onClose={() => setOpen(false)} />}
    </>
  );
}
