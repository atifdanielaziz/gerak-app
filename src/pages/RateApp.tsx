import React, { useState } from 'react';
import { Star, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const RateApp: React.FC = () => {
  const [rating, setRating]   = useState(0);
  const [hover, setHover]     = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    if (submitting) return;
    if (rating < 1) { setError('Please pick a star rating.'); return; }
    setError('');
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('submit_app_rating', {
      p_rating: rating,
      p_comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (rpcError || !data?.success) {
      console.error('[GERAK] submit_app_rating failed:', { rpcError, data });
      setError(data?.error ?? (rpcError ? 'Network error — please check your connection and try again.' : 'Could not submit your rating. Please try again.'));
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <div className="flex-grow bg-white overflow-y-auto no-scrollbar px-5 animate-fade-in flex flex-col items-center justify-center text-center gap-3 pb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 m-0">Thanks for your feedback!</h2>
        <p className="text-sm text-slate-400 font-normal max-w-xs leading-relaxed">
          Your rating helps us make Gerak better.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-white overflow-y-auto no-scrollbar pb-8 px-5 animate-fade-in flex flex-col gap-4">

      <div className="mt-4 flex items-center gap-2 pl-1">
        <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Star className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 m-0">Rate Gerak</h2>
          <p className="text-xs text-slate-400 font-normal mt-0.5">How's your experience been?</p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center gap-5">
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              type="button"
              onPointerDown={(e) => { e.preventDefault(); setRating(n); }}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="w-11 h-11 flex items-center justify-center active:scale-90 transition"
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  n <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                }`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Anything you'd like us to know? (optional)"
          rows={4}
          style={{ fontSize: '16px' }}
          className="w-full bg-white border border-slate-100 rounded-2xl py-3 px-4 text-sm font-normal text-slate-700 resize-none focus:outline-none focus:border-slate-900 transition placeholder:font-normal placeholder:text-slate-300"
        />

        {error && <p className="text-xs text-danger font-semibold text-center w-full">{error}</p>}

        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); submit(); }}
          disabled={submitting}
          className="w-full bg-primary text-white font-semibold py-3.5 rounded-2xl active:scale-[0.98] disabled:opacity-50 transition"
        >
          {submitting ? 'Submitting…' : 'Submit Rating'}
        </button>
      </div>

    </div>
  );
};
