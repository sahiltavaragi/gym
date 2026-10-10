"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/card";
import { Tabs } from "@/components/tabs";
import { formatCurrency, formatDate, monthLabel } from "@/lib/utils";

type MemberRow = { id: string; status: string; created_at: string };
type InvoiceRow = {
  id: string;
  amount: number;
  status: string;
  billing_month: string;
  due_date: string;
};
type PaymentRow = { id: string; amount: number; payment_date: string; payment_method: string };
type ReportRow = { id: string; created_at: string; report_month: string };
type MessageRow = { id: string; status: string; created_at: string };
type AuditRow = {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
};

export function ReportsClient({
  members,
  invoices,
  payments,
  reports,
  messages,
  audit,
}: {
  members: MemberRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  reports: ReportRow[];
  messages: MessageRow[];
  audit: AuditRow[];
}) {
  const [tab, setTab] = useState("revenue");

  const revenue = useMemo(() => {
    const daily = new Map<string, number>();
    const monthly = new Map<string, number>();
    const yearly = new Map<string, number>();
    for (const p of payments) {
      const d = p.payment_date;
      if (!d) continue;
      daily.set(d, (daily.get(d) ?? 0) + Number(p.amount));
      const mk = d.slice(0, 7);
      monthly.set(mk, (monthly.get(mk) ?? 0) + Number(p.amount));
      const yk = d.slice(0, 4);
      yearly.set(yk, (yearly.get(yk) ?? 0) + Number(p.amount));
    }
    return {
      daily: [...daily.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30),
      monthly: [...monthly.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12),
      yearly: [...yearly.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [payments]);

  const billingStats = {
    paid: invoices.filter((i) => i.status === "paid"),
    pending: invoices.filter((i) => i.status === "pending"),
    overdue: invoices.filter((i) => i.status === "overdue"),
  };

  const thisMonth = new Date().toISOString().slice(0, 7);
  const membershipStats = {
    newThisMonth: members.filter((m) => (m.created_at ?? "").startsWith(thisMonth)).length,
    active: members.filter((m) => m.status === "active" || m.status === "expiring_soon").length,
    expired: members.filter((m) => m.status === "expired").length,
  };

  function exportCsv(name: string, rows: (string | number)[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("CSV downloaded");
  }

  const sum = (rows: { amount: number }[]) =>
    rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Reports</h1>
        <p className="text-sm text-slate-500">Revenue, billing, membership and audit analytics</p>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "revenue", label: "Revenue" },
          { value: "billing", label: "Billing" },
          { value: "membership", label: "Membership" },
          { value: "health", label: "Health" },
          { value: "audit", label: "Audit Log" },
        ]}
      />

      {tab === "revenue" && (
        <Card>
          <CardHeader
            title="Revenue"
            subtitle={`Total collected: ${formatCurrency(sum(payments))}`}
            action={
              <button
                onClick={() =>
                  exportCsv("revenue", [
                    ["Date", "Amount"],
                    ...revenue.daily.map(([d, a]) => [d, a]),
                  ])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            }
          />
          <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Daily (last 30)
              </h4>
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {revenue.daily.map(([d, a]) => (
                  <div key={d} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{formatDate(d)}</span>
                    <span className="font-medium text-slate-800">{formatCurrency(a)}</span>
                  </div>
                ))}
                {revenue.daily.length === 0 && (
                  <p className="text-sm text-slate-400">No collections yet.</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Monthly
              </h4>
              <div className="space-y-1.5">
                {revenue.monthly.map(([d, a]) => (
                  <div key={d} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{monthLabel(d + "-01")}</span>
                    <span className="font-medium text-slate-800">{formatCurrency(a)}</span>
                  </div>
                ))}
                {revenue.monthly.length === 0 && (
                  <p className="text-sm text-slate-400">No data.</p>
                )}
              </div>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Yearly
              </h4>
              <div className="space-y-1.5">
                {revenue.yearly.map(([d, a]) => (
                  <div key={d} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{d}</span>
                    <span className="font-medium text-slate-800">{formatCurrency(a)}</span>
                  </div>
                ))}
                {revenue.yearly.length === 0 && (
                  <p className="text-sm text-slate-400">No data.</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {tab === "billing" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(
            [
              ["Paid bills", billingStats.paid],
              ["Pending bills", billingStats.pending],
              ["Overdue bills", billingStats.overdue],
            ] as const
          ).map(([title, rows]) => (
            <Card key={title}>
              <CardHeader
                title={title}
                subtitle={`${rows.length} · ${formatCurrency(sum(rows))}`}
                action={
                  <button
                    onClick={() =>
                      exportCsv(title.toLowerCase().replace(" ", "-"), [
                        ["Month", "Amount", "Due", "Status"],
                        ...rows.map((r) => [monthLabel(r.billing_month), r.amount, r.due_date, r.status]),
                      ])
                    }
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <div className="max-h-96 space-y-1.5 overflow-y-auto p-4">
                {rows.map((r) => (
                  <div key={r.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-600">{monthLabel(r.billing_month)}</span>
                    <span className="font-medium text-slate-800">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
                {rows.length === 0 && <p className="text-sm text-slate-400">Nothing here.</p>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "membership" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              ["New members (this month)", membershipStats.newThisMonth],
              ["Active members", membershipStats.active],
              ["Expired members", membershipStats.expired],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="p-5">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="mt-1 text-3xl font-bold text-slate-800">{value}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === "health" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              ["Reports generated", reports.length],
              [
                "Reports sent",
                messages.filter((m) => m.status === "sent" || m.status === "delivered").length,
              ],
              ["Failed messages", messages.filter((m) => m.status === "failed").length],
            ] as const
          ).map(([label, value]) => (
            <Card key={label} className="p-5">
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="mt-1 text-3xl font-bold text-slate-800">{value}</div>
            </Card>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader title="Audit Log" subtitle="Last 50 admin actions" />
          <div className="overflow-x-auto scroll-x">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                  {["Action", "Entity", "Details", "Time"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{a.action}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.entity ?? "—"}
                      {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}
                    </td>
                    <td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500">
                      {a.details ? JSON.stringify(a.details) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(a.created_at)}</td>
                  </tr>
                ))}
                {audit.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                      No audit entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
