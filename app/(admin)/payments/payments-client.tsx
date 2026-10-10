"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import type { Invoice, Payment } from "@/lib/types";
import { createPayment, markInvoicePaid } from "@/lib/actions/billing";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field } from "@/components/input";
import { Modal } from "@/components/modal";
import { EmptyState } from "@/components/skeleton";
import { formatCurrency, formatDate, monthLabel } from "@/lib/utils";

type PaymentRow = Payment & {
  member?: { id: string; full_name: string };
  invoice?: { id: string; billing_month: string; pay_token: string };
};

type UnpaidRow = Invoice & { member?: { full_name: string } | null };

export function PaymentsClient({
  payments,
  unpaid,
}: {
  payments: PaymentRow[];
  unpaid: UnpaidRow[];
}) {
  const router = useRouter();
  const [methodFilter, setMethodFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    invoice_id: "",
    payment_method: "cash" as Payment["payment_method"],
    payment_date: new Date().toISOString().slice(0, 10),
    reference: "",
  });

  const filtered = useMemo(() => {
    if (!methodFilter) return payments;
    return payments.filter((p) => p.payment_method === methodFilter);
  }, [payments, methodFilter]);

  const total = filtered.reduce((s, p) => s + Number(p.amount), 0);

  async function submit() {
    if (!form.invoice_id) return toast.error("Select a bill");
    setLoading(true);
    const res = await markInvoicePaid(form.invoice_id, form.payment_method, form.reference || undefined);
    setLoading(false);
    if (res.error) return toast.error(res.error);
    toast.success("Payment recorded");
    setOpen(false);
    router.refresh();
  }

  function exportCsv() {
    const rows = [
      ["Member", "Invoice Month", "Amount", "Date", "Method", "Reference"],
      ...filtered.map((p) => [
        p.member?.full_name ?? "",
        p.invoice ? monthLabel(p.invoice.billing_month) : "",
        String(p.amount),
        p.payment_date,
        p.payment_method,
        p.reference ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success("CSV downloaded");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Payments</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} payments · {formatCurrency(total)} collected
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            onClick={() => {
              setForm((f) => ({ ...f, invoice_id: "" }));
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Record Payment
          </Button>
        </div>
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4">
          <Select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="w-auto"
          >
            <option value="">All methods</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="other">Other</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No payments"
            message="Record a payment when a member pays their bill."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Record Payment
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto scroll-x">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                  {["Member", "Invoice", "Amount", "Date", "Method", "Reference", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {p.member?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.invoice ? monthLabel(p.invoice.billing_month) : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-3">
                      <span className="uppercase text-slate-600">{p.payment_method}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge status={p.confirmed_by_admin ? "paid" : "pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Payment" wide>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Bill">
              <Select value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}>
                <option value="">Select unpaid bill…</option>
                {unpaid.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.member?.full_name} — {monthLabel(inv.billing_month)} —{" "}
                    {formatCurrency(inv.amount)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Method">
            <Select
              value={form.payment_method}
              onChange={(e) =>
                setForm({ ...form, payment_method: e.target.value as Payment["payment_method"] })
              }
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Payment Date">
            <Input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reference (optional)">
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
                placeholder="UTR / transaction ID"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={loading}>
              Record payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
