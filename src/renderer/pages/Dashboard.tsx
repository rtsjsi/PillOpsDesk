import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats, StockRow } from '../../shared/types';
import { inr, formatDate, daysUntil } from '../lib/format';
import { Spinner, Badge, EmptyState } from '../components/ui';

function StatCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-shadow hover:shadow-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </button>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [expiring, setExpiring] = useState<StockRow[]>([]);
  const [lowStock, setLowStock] = useState<StockRow[]>([]);

  useEffect(() => {
    window.pharmacy.reports.dashboard().then(setStats);
    Promise.all([
      window.pharmacy.reports.expiring(90),
      window.pharmacy.reports.expiredInStock(),
    ]).then(([soon, expired]) => setExpiring([...expired, ...soon]));
    window.pharmacy.reports.lowStock().then(setLowStock);
  }, []);

  if (!stats) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <button
          className="btn-primary"
          onClick={() => navigate('/sales', { state: { openNewSale: true } })}
        >
          + New Sale
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Today's Sales"
          value={inr(stats.todaySalesTotal)}
          tone="text-brand-700"
        />
        <StatCard
          label="Today's Invoices"
          value={stats.todayInvoiceCount}
          tone="text-slate-800"
        />
        <StatCard
          label="Total Medicines"
          value={stats.totalMedicines}
          tone="text-slate-800"
          onClick={() => navigate('/inventory')}
        />
        <StatCard
          label="Low Stock Items"
          value={stats.lowStockCount}
          tone="text-amber-600"
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Expiring Soon"
          value={stats.expiringSoonCount}
          tone="text-orange-600"
          onClick={() => navigate('/reports')}
        />
        <StatCard
          label="Expired In Stock"
          value={stats.expiredCount}
          tone="text-red-600"
          onClick={() => navigate('/reports')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-700">
            Expiring / Expired Batches
          </div>
          <div className="max-h-80 overflow-y-auto">
            {expiring.length === 0 ? (
              <EmptyState message="No batches expiring within 90 days." />
            ) : (
              <table className="w-full">
                <tbody>
                  {expiring.slice(0, 30).map((b) => {
                    const d = daysUntil(b.expiry_date);
                    return (
                      <tr key={b.id} className="border-b border-slate-100">
                        <td className="td">
                          <div className="font-medium">{b.medicine_name}</div>
                          <div className="text-xs text-slate-400">
                            Batch {b.batch_no} · Qty {b.quantity_in_stock}
                          </div>
                        </td>
                        <td className="td text-right">
                          <div>{formatDate(b.expiry_date)}</div>
                          {d < 0 ? (
                            <Badge tone="red">Expired</Badge>
                          ) : (
                            <Badge tone="amber">{d}d left</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-700">
            Low Stock
          </div>
          <div className="max-h-80 overflow-y-auto">
            {lowStock.length === 0 ? (
              <EmptyState message="All items are sufficiently stocked." />
            ) : (
              <table className="w-full">
                <tbody>
                  {lowStock.slice(0, 30).map((b) => (
                    <tr key={b.id} className="border-b border-slate-100">
                      <td className="td">
                        <div className="font-medium">{b.medicine_name}</div>
                        <div className="text-xs text-slate-400">
                          Reorder level {b.reorder_level}
                        </div>
                      </td>
                      <td className="td text-right">
                        <Badge tone="amber">Qty {b.quantity_in_stock}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
