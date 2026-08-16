import React, { useEffect, useState } from 'react';
import { MessageSquareText, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Feedback = { id: string; service: string; rating: number; message: string; created_at: string };

export const ProviderFeedback: React.FC = () => {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('provider_feedback').select('id,service,rating,message,created_at').order('created_at', { ascending: false });
      if (!error) setItems((data as Feedback[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] bg-white">
      <div className="flex items-center gap-2"><MessageSquareText className="w-5 h-5 text-slate-400" /><h1 className="font-semibold text-slate-900">Feedback</h1></div>
      <p className="text-sm font-normal text-slate-400 mt-1 mb-5">Feedback received from your customers.</p>
      {loading ? <div className="py-16 flex justify-center"><span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div> : items.length === 0 ? (
        <section className="border border-slate-100 rounded-3xl p-8 text-center"><MessageSquareText className="w-10 h-10 text-slate-200 mx-auto mb-3" /><h2 className="font-semibold text-slate-800">No feedback yet</h2><p className="text-sm text-slate-400 mt-1">Customer feedback will appear here.</p></section>
      ) : <div className="space-y-3">{items.map(item => <article key={item.id} className="border border-slate-100 rounded-2xl p-4"><div className="flex justify-between gap-3"><span className="font-semibold text-slate-800 capitalize">{item.service}</span><span className="flex items-center gap-1 text-sm text-amber-500"><Star className="w-4 h-4 fill-current" />{item.rating}</span></div><p className="text-sm text-slate-600 mt-3">{item.message}</p><time className="block text-xs text-slate-400 mt-3">{new Date(item.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</time></article>)}</div>}
    </main>
  );
};
