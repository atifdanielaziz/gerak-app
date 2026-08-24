import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { Plus, ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';
import { useApp } from '../../../context/AppContext';

interface Route {
  id: string;
  campus: string;
  point_a: string;
  point_b: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface RoutesTabHandle {
  reload: () => void;
}

interface RoutesTabProps {
  active: boolean;
  isSuperAdmin: boolean;
  adminCampus: string;
  // campusView is shared with the Orders tab's own campus switcher — read
  // and written here, not owned here.
  campusView: 'Pekan' | 'Gambang';
  onCampusViewChange: (c: 'Pekan' | 'Gambang') => void;
  showToast: (msg: string) => void;
}

// Fixed-route pricing (point A ↔ point B) management — split out of
// AdminHome.tsx. No cross-tab modal-tracking here (unlike Drivers/Users):
// the add/edit form is inline within the tab, not an overlay sheet.
export const RoutesTab = forwardRef<RoutesTabHandle, RoutesTabProps>(function RoutesTab(
  { active, isSuperAdmin, adminCampus, campusView, onCampusViewChange, showToast },
  ref
) {
  const { showConfirmModal } = useApp();
  const [routes, setRoutes]               = useState<Route[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRoute, setEditingRoute]   = useState<Route | null>(null);
  const [routePointA, setRoutePointA]     = useState('');
  const [routePointB, setRoutePointB]     = useState('');
  const [routePrice, setRoutePrice]       = useState('');
  const [savingRoute, setSavingRoute]     = useState(false);

  const loadRoutes = useCallback(async () => {
    setRoutesLoading(true);
    const campus = isSuperAdmin ? campusView : adminCampus;
    const { data } = await supabase
      .from('routes')
      .select('id,campus,point_a,point_b,price,is_active,created_at')
      .eq('campus', campus)
      .order('point_a');
    setRoutes(data ?? []);
    setRoutesLoading(false);
  }, [isSuperAdmin, campusView, adminCampus]);

  useLoadOnActive(active, loadRoutes);
  useImperativeHandle(ref, () => ({ reload: loadRoutes }), [loadRoutes]);

  const resetRouteForm = () => {
    setRoutePointA(''); setRoutePointB(''); setRoutePrice('');
    setEditingRoute(null); setShowRouteForm(false);
  };

  const handleSaveRoute = async () => {
    if (!routePointA.trim() || !routePointB.trim() || !routePrice.trim()) return;
    setSavingRoute(true);
    const campus = isSuperAdmin ? campusView : adminCampus;
    if (editingRoute) {
      const { error } = await supabase.from('routes').update({
        point_a: routePointA.trim(),
        point_b: routePointB.trim(),
        price: parseFloat(routePrice),
      }).eq('id', editingRoute.id);
      if (error) showToast(error.message);
      else { showToast('Route updated.'); resetRouteForm(); loadRoutes(); }
    } else {
      const { error } = await supabase.from('routes').insert({
        campus,
        point_a: routePointA.trim(),
        point_b: routePointB.trim(),
        price: parseFloat(routePrice),
      });
      if (error) showToast(error.message);
      else { showToast('Route added.'); resetRouteForm(); loadRoutes(); }
    }
    setSavingRoute(false);
  };

  const handleDeleteRoute = async (id: string) => {
    await supabase.from('routes').delete().eq('id', id);
    showToast('Route deleted.');
    loadRoutes();
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Campus switcher — superadmin only */}
      {isSuperAdmin && (
        <div className="flex bg-white border border-slate-100 rounded-2xl p-1 gap-1">
          {(['Gambang', 'Pekan'] as const).map(c => (
            // Two stacked layers instead of toggling bg-primary directly —
            // this WebView unreliably repaints colour changes; opacity
            // changes repaint reliably, so only opacity is toggled here.
            <button key={c} onPointerDown={(e) => { e.preventDefault(); onCampusViewChange(c); }}
              className="relative flex-1 rounded-xl transition-transform">
              <span className="block py-2 text-xs font-semibold text-slate-400">{c}</span>
              <span
                className={`absolute inset-0 flex items-center justify-center py-2 rounded-xl bg-primary text-white text-xs font-semibold transition-opacity duration-150 ${
                  campusView === c ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {c}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Add button */}
      {!showRouteForm && (
        <button onClick={() => setShowRouteForm(true)}
          className="flex items-center justify-center gap-2 bg-primary text-white font-semibold text-xs py-3 rounded-2xl transition active:scale-95 shadow-md shadow-primary/20">
          <Plus className="w-4 h-4" /> Add Route
        </button>
      )}

      {/* Add / Edit form */}
      {showRouteForm && (
        <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-slate-700">
            {editingRoute ? 'Edit Route' : 'New Route'}
          </h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Point A</label>
            <input
              type="text"
              value={routePointA}
              onChange={e => setRoutePointA(e.target.value)}
              placeholder="e.g. KK1"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          <div className="flex items-center justify-center">
            <ArrowLeftRight className="w-4 h-4 text-slate-300" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Point B</label>
            <input
              type="text"
              value={routePointB}
              onChange={e => setRoutePointB(e.target.value)}
              placeholder="e.g. Fakulti Kejuruteraan"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-normal text-slate-400">Price (RM)</label>
            <input
              type="number"
              min="0"
              step="0.50"
              value={routePrice}
              onChange={e => setRoutePrice(e.target.value)}
              placeholder="e.g. 5.00"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-primary transition"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={resetRouteForm}
              className="flex-1 bg-slate-100 text-slate-600 font-semibold text-xs py-2.5 rounded-xl transition active:scale-95">
              Cancel
            </button>
            <button onClick={handleSaveRoute}
              disabled={savingRoute || !routePointA.trim() || !routePointB.trim() || !routePrice.trim()}
              className="flex-1 bg-primary text-white font-semibold text-xs py-2.5 rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {savingRoute
                ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                : editingRoute ? 'Save Changes' : 'Add Route'}
            </button>
          </div>
        </div>
      )}

      {/* Routes list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <ArrowLeftRight className="w-4 h-4" /> Routes — UMPSA {isSuperAdmin ? campusView : adminCampus}
        </h3>

        <div className="overflow-y-auto no-scrollbar max-h-[420px] flex flex-col gap-2">
        {routesLoading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : routes.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No routes yet. Add one above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {routes.map(r => (
              <div key={r.id} className={`rounded-2xl border p-5 flex flex-col gap-2.5 ${r.is_active ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                {/* Route display */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800">{r.point_a}</p>
                    <div className="flex items-center gap-1 my-0.5">
                      <ArrowLeftRight className="w-3 h-3 text-slate-300 shrink-0" />
                    </div>
                    <p className="text-xs font-black text-slate-800">{r.point_b}</p>
                  </div>
                  <p className="text-sm font-black text-slate-800 shrink-0">RM{Number(r.price).toFixed(2)}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingRoute(r);
                      setRoutePointA(r.point_a);
                      setRoutePointB(r.point_b);
                      setRoutePrice(String(r.price));
                      setShowRouteForm(true);
                    }}
                    className="px-3 bg-slate-50 border border-slate-200 text-slate-500 font-semibold text-xs py-2 rounded-xl transition active:scale-95 flex items-center justify-center gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={() => showConfirmModal({
                      title: 'Delete Route?',
                      message: `This removes the ${r.point_a} ↔ ${r.point_b} route. This can't be undone.`,
                      confirmLabel: 'DELETE',
                      onConfirm: () => handleDeleteRoute(r.id),
                    })}
                    className="w-11 h-11 bg-red-50 border border-red-100 text-red-400 font-semibold text-xs rounded-xl transition active:scale-95 flex items-center justify-center gap-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
});
