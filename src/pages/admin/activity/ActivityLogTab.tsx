import { forwardRef, useCallback, useImperativeHandle, useMemo, useState, type ElementType } from 'react';
import { supabase } from '../../../lib/supabase';
import { History, RefreshCw, Search, User, PlusCircle, Pencil, Trash2 } from 'lucide-react';
import { useLoadOnActive } from '../../../hooks/useLoadOnActive';

interface ActivityLogRow {
  id: string;
  actor_id: string | null;
  actor_name: string;
  table_name: string;
  record_id: string | null;
  action: 'insert' | 'update' | 'delete';
  changes: { old: Record<string, unknown> | null; new: Record<string, unknown> | null } | null;
  created_at: string;
}

const TABLE_LABEL: Record<string, string> = {
  app_settings:             'Settings',
  driver_invites:           'Invites',
  routes:                   'Routes',
  announcements:            'Banners',
  academic_calendars:       'Calendar',
  jubah_rider_assignments:  'Jubah Riders',
  profiles:                 'Users',
  jubah_bookings:           'Jubah Bookings',
  ride_orders:              'Ride Orders',
};

const ROLE_LABEL: Record<string, string> = { driver: 'Driver', rider: 'Rider', admin: 'Admin', customer: 'Customer', superadmin: 'Superadmin' };

const ACTION_ICON: Record<ActivityLogRow['action'], ElementType> = {
  insert: PlusCircle,
  update: Pencil,
  delete: Trash2,
};

const ACTION_STYLE: Record<ActivityLogRow['action'], string> = {
  insert: 'bg-emerald-50 text-emerald-600',
  update: 'bg-amber-50 text-amber-600',
  delete: 'bg-red-50 text-red-500',
};

// Turns a row's raw old/new jsonb diff into a plain-English sentence, one
// small formatter per table (per plan). Anything not covered by a specific
// case — a currently-unhandled table, or a field combination the table's
// formatter doesn't recognize — falls through to a generic "changed
// x, y, z" listing built straight from the diff, so nothing is ever
// silently hidden even if the phrasing isn't as polished.
function describeChange(row: ActivityLogRow): string {
  const { table_name: table, action, changes, record_id } = row;
  const oldR = changes?.old ?? {};
  const newR = changes?.new ?? {};
  const changedKeys = Object.keys({ ...oldR, ...newR }).filter(k => JSON.stringify(oldR[k]) !== JSON.stringify(newR[k]));

  const fmtVal = (v: unknown) => v === null || v === undefined || v === '' ? '—' : String(v);

  if (table === 'app_settings') {
    if (changedKeys.includes('value')) return `Changed "${record_id}": ${fmtVal(oldR.value)} → ${fmtVal(newR.value)}`;
    return `Updated setting "${record_id}"`;
  }

  if (table === 'profiles') {
    const parts: string[] = [];
    if (changedKeys.includes('role')) parts.push(`role: ${ROLE_LABEL[String(oldR.role)] ?? oldR.role} → ${ROLE_LABEL[String(newR.role)] ?? newR.role}`);
    if (changedKeys.includes('status')) parts.push(`status: ${fmtVal(oldR.status)} → ${fmtVal(newR.status)}`);
    if (changedKeys.includes('docs_status')) parts.push(`docs: ${fmtVal(oldR.docs_status)} → ${fmtVal(newR.docs_status)}`);
    if (changedKeys.includes('campus')) parts.push(`campus: ${fmtVal(oldR.campus)} → ${fmtVal(newR.campus)}`);
    for (const [key, label] of [['can_drive', 'Gerak Car'], ['can_rent', 'Gerak Rental'], ['can_transport', 'Gerak Transporter'], ['can_daily', 'Gerak Daily'], ['can_robe', 'Jubah Delivery'], ['receipt_gate_exempt', 'receipt gate exemption']] as const) {
      if (changedKeys.includes(key)) parts.push(newR[key] ? `granted ${label}` : `revoked ${label}`);
    }
    return parts.length ? `Changed ${parts.join(', ')}` : 'Updated profile';
  }

  if (table === 'jubah_bookings') {
    if (action === 'delete') return 'Deleted booking';
    const parts: string[] = [];
    if (changedKeys.includes('status')) parts.push(`status: ${fmtVal(oldR.status)} → ${fmtVal(newR.status)}`);
    if (changedKeys.includes('balance_paid') && newR.balance_paid) parts.push('balance marked paid');
    if (changedKeys.includes('needs_reconciliation') && newR.needs_reconciliation) parts.push('flagged for reconciliation');
    if (newR.cancelled_by) parts.push(`cancelled by ${fmtVal(newR.cancelled_by)}`);
    return parts.length ? `Changed ${parts.join(', ')}` : 'Updated booking';
  }

  if (table === 'routes') {
    if (action === 'insert') return `Added route: ${fmtVal(newR.point_a)} → ${fmtVal(newR.point_b)} (RM ${fmtVal(newR.price)})`;
    if (action === 'delete') return `Deleted route: ${fmtVal(oldR.point_a)} → ${fmtVal(oldR.point_b)}`;
    if (changedKeys.includes('price')) return `Changed price: RM ${fmtVal(oldR.price)} → RM ${fmtVal(newR.price)}`;
    if (changedKeys.includes('is_active')) return newR.is_active ? 'Activated route' : 'Deactivated route';
    return 'Updated route';
  }

  if (table === 'driver_invites') {
    const roleLabel = ROLE_LABEL[String((action === 'insert' ? newR : oldR).role)] ?? String((action === 'insert' ? newR : oldR).role);
    if (action === 'insert') return `Invited ${fmtVal(newR.email)} as ${roleLabel}`;
    if (action === 'delete') return `Removed invite for ${fmtVal(oldR.email)}`;
    return 'Updated invite';
  }

  if (table === 'announcements') {
    if (action === 'insert') return `Added banner: "${fmtVal(newR.title)}"`;
    if (action === 'delete') return `Deleted banner: "${fmtVal(oldR.title)}"`;
    if (changedKeys.includes('is_active')) return newR.is_active ? `Activated banner: "${fmtVal(newR.title)}"` : `Deactivated banner: "${fmtVal(newR.title)}"`;
    return `Updated banner: "${fmtVal(newR.title)}"`;
  }

  if (table === 'academic_calendars') {
    if (action === 'insert') return `Added calendar: ${fmtVal(newR.university)} ${fmtVal(newR.academic_year)}`;
    return `Updated calendar: ${fmtVal(newR.university)} ${fmtVal(newR.academic_year)}`;
  }

  if (table === 'jubah_rider_assignments') {
    if (action === 'insert') return `Assigned rider to drop point "${fmtVal(newR.drop_point)}"`;
    return `Removed rider from drop point "${fmtVal(oldR.drop_point)}"`;
  }

  if (table === 'ride_orders') {
    return `Deleted ride order (was ${fmtVal(oldR.status)})`;
  }

  // Fallback for anything not covered above.
  if (!changedKeys.length) return action === 'insert' ? 'Created record' : action === 'delete' ? 'Deleted record' : 'Updated record';
  return `Changed ${changedKeys.join(', ')}`;
}

export interface ActivityLogTabHandle {
  reload: () => void;
}

interface ActivityLogTabProps {
  active: boolean;
}

// Superadmin-only read-only viewer for admin_activity_log — populated by
// Postgres triggers (see supabase/migration_admin_activity_log.sql), not
// by anything this component writes. No mutation RPCs here, same shape as
// EarningsTab.tsx.
export const ActivityLogTab = forwardRef<ActivityLogTabHandle, ActivityLogTabProps>(function ActivityLogTab(
  { active },
  ref
) {
  const [rows, setRows]         = useState<ActivityLogRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [search, setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('admin_activity_log')
      .select('id, actor_id, actor_name, table_name, record_id, action, changes, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    setRows((data as ActivityLogRow[]) ?? []);
    setLoading(false);
  }, []);

  useLoadOnActive(active, load);
  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  const filtered = useMemo(() => rows
    .filter(r => tableFilter === 'all' || r.table_name === tableFilter)
    .filter(r => !search.trim() || r.actor_name.toLowerCase().includes(search.trim().toLowerCase())),
    [rows, tableFilter, search]);

  const tablesPresent = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))), [rows]);

  return (
    <div className="flex flex-col gap-4">

      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by admin name"
              style={{ fontSize: '12px' }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 font-semibold text-slate-700 focus:outline-none focus:border-primary transition placeholder:font-normal"
            />
          </div>
          <button onClick={load}
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-slate-50 border border-slate-200 text-slate-400 hover:text-primary transition active:scale-90">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Two stacked layers instead of toggling colour classes directly —
            this WebView unreliably repaints colour changes; opacity
            changes repaint reliably, so only opacity is toggled here. */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button onPointerDown={e => { e.preventDefault(); setTableFilter('all'); }}
            className="relative shrink-0 rounded-full transition">
            <span className="block px-3 py-1.5 rounded-full text-xs font-semibold border bg-white text-slate-500 border-slate-200">All</span>
            <span
              className={`absolute inset-0 flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border bg-primary text-white border-primary transition-opacity duration-150 ${
                tableFilter === 'all' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              All
            </span>
          </button>
          {tablesPresent.map(t => {
            const label = TABLE_LABEL[t] ?? t;
            return (
              <button key={t} onPointerDown={e => { e.preventDefault(); setTableFilter(t); }}
                className="relative shrink-0 rounded-full transition">
                <span className="block px-3 py-1.5 rounded-full text-xs font-semibold border bg-white text-slate-500 border-slate-200 whitespace-nowrap">{label}</span>
                <span
                  className={`absolute inset-0 flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-semibold border bg-primary text-white border-primary whitespace-nowrap transition-opacity duration-150 ${
                    tableFilter === t ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Log list */}
      <div className="bg-white border border-slate-100 rounded-3xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <History className="w-4 h-4" /> Activity Log
        </h3>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold text-center py-6">No activity recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(row => {
              const Icon = ACTION_ICON[row.action];
              return (
                <div key={row.id} className="border border-slate-100 rounded-2xl p-3.5 flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${ACTION_STYLE[row.action]}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 leading-snug">{describeChange(row)}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400 font-semibold">
                      <User className="w-3 h-3" />
                      <span>{row.actor_name}</span>
                      <span>·</span>
                      <span>{TABLE_LABEL[row.table_name] ?? row.table_name}</span>
                      <span>·</span>
                      <span>{new Date(row.created_at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
