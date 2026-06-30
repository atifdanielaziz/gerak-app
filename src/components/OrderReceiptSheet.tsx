import React from 'react';
import { WaBtn } from '../lib/whatsapp';

export interface OrderReceiptFields {
  id: string;
  date: string;
  time: string;
  campus: string;
  pickup: string;
  destination: string;
  passengers: number;
  contact: string;
  fare: string;
  night_charge: number;
  notes: string;
  status: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  pending:     'bg-amber-50 text-amber-600 border-amber-200',
  accepted:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-300',
  completed:   'bg-slate-100 text-slate-500 border-slate-200',
  cancelled:   'bg-red-50 text-red-400 border-red-200',
};

const STATUS_LABEL: Record<string, string> = {
  pending:     'Pending',
  accepted:    'Accepted',
  in_progress: 'In Progress',
  completed:   'Completed',
  cancelled:   'Cancelled',
};

const fareLabel = (o: OrderReceiptFields) =>
  o.fare === 'TBC' ? 'TBC' : `RM${(Number(o.fare) + (o.night_charge ?? 0)).toFixed(2)}`;

export const OrderReceiptBlock: React.FC<{ order: OrderReceiptFields; showWhatsApp?: boolean }> = ({ order, showWhatsApp }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 space-y-1.5 leading-relaxed">
    <p><span className="text-slate-400">Date:</span>{' '}<span className="text-blue-600 font-bold">{order.date}</span></p>
    <p>
      <span className="text-slate-400">Time:</span>{' '}
      <span className="text-blue-600 font-bold">{order.time}</span>
      {order.night_charge > 0 ? ' (Night +RM5)' : ''}
    </p>
    <p><span className="text-slate-400">Campus:</span> UMPSA {order.campus}</p>
    <p><span className="text-slate-400">Pick-up:</span> {order.pickup}</p>
    <p><span className="text-slate-400">Destination:</span> {order.destination}</p>
    <p><span className="text-slate-400">Passengers:</span> {order.passengers} pax</p>
    <p className="flex items-center gap-2">
      <span className="text-slate-400">Contact:</span>
      <span>{order.contact}</span>
      {showWhatsApp && <WaBtn phone={order.contact} />}
    </p>
    <p><span className="text-slate-400">Est. Fare:</span> {fareLabel(order)}</p>
    {order.notes && <p><span className="text-slate-400">Remark:</span> {order.notes}</p>}
  </div>
);

export const OrderReceiptSheet: React.FC<{ order: OrderReceiptFields; onClose: () => void; showWhatsApp?: boolean }> = ({ order, onClose, showWhatsApp }) => {
  const badgeCls  = STATUS_STYLE[order.status] ?? STATUS_STYLE.cancelled;
  const badgeLbl  = STATUS_LABEL[order.status] ?? order.status;
  const createdAt = new Date(order.created_at)
    .toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] max-h-[85vh] overflow-y-auto no-scrollbar bg-white rounded-t-3xl shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        <div className="px-5 pt-2 pb-8 flex flex-col gap-3">
          {/* Status + date */}
          <div className="flex items-center justify-between">
            <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${badgeCls}`}>
              {badgeLbl}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">{createdAt}</span>
          </div>

          <OrderReceiptBlock order={order} showWhatsApp={showWhatsApp} />

          <button onClick={onClose}
            className="w-full py-3 rounded-2xl bg-slate-100 text-slate-500 font-extrabold text-xs active:scale-95 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
