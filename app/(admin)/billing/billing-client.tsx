"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Zap, Ban, Undo2, CheckCircle2, Copy, Link2 } from "lucide-react";
import type { Invoice, GymSettings, Payment } from "@/lib/types";
import {
  createInvoice,
  generateMonthlyBills,
  markInvoicePaid,
  markInvoiceUnpaid,
  cancelInvoice,
} from "@/lib/actions/billing";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field } from "@/components/input";
import { Modal, ConfirmDialog } from "@/components/modal";
import { EmptyState } from "@/components/skeleton";
import { formatCurrency, formatDate, monthKey, monthLabel, cn } from "@/lib/utils";

type MemberLite = {
  id: string;
  full_name: string;
  status: string;
  monthly_fee: number;
  membership_end_date: string | null;
};

export function BillingClient({
  invoices,
  members,
  settings,
}: {
  invoices: (Invoice & { member?: { id: string; full_name: string; status: string } })[];
  members: MemberLite[];
  settings: GymSettings | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(params.get("generate") === "1");
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [month, setMonth] = useState(monthKey());
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<Payment["payment_method"]>("cash");
  const [reference, setReference] = useState("");

  const [form, setForm] = useState({
    member_id: "",
    billing_month: monthKey(),
    amount: 1000,
    due_date: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    let list = [...invoices];
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter((i) => i.member?.full_name.toLowerCase().includes(s));
    }
    return list;
  }, [invoices, statusFilter, q]);

  const total = (s: string) =>
    invoices.filter((i) => i.status === s).reduce((a, i) => a + Number(i.amount), 0);

  async function doGenerate() {
    setLoading(true);
    const dueDay = settings?.default_due_day ?? 10;
    const res = await generateMonthlyBills(month, dueDay);
    setLoading(false);
    if (res.error) return toast.error(res.error);
    const d = res.data as { created: number; skipped: number };
    toast.success(
      d.created === 0
        ? `All eligible members already have bills for ${monthLabel(month)}.`
        : `Created ${d.created} bill${d.created > 1 ? "s" : ""} (${d.skipped} already existed).`
    );
    setGenOpen(false);
    router.refresh();
  }

  async function doAdd() {
    if (!form.member_id) return toast.error("Select a member");
    setLoading(true);
    const res = await createInvoice({
      member_id: form.member_id,
      billing_month: form.billing_month,
      amount: Number(form.amount),
      due_date: form.due_date || form.billing_month.slice(0, 7) + "-" + String(settings?.default_due_day ?? 10).padStart(2, "0"),
      notes: form.notes || null,
    } as never);
    setLoading(false);
    if (res.error) return toast.error(res.error);
    toast.success("Bill created");
    setAddOpen(false);
    router.refresh();
  }

  async function doPay() {
    if (!payInvoice) return;
    setLoading(true);
    const res = await markInvoicePaid(payInvoice.id, method, reference || undefined);
    setLoading(false);
    setPayInvoice(null);
    setReference("");
    if (res.error) return toast.error(res.error);
    toast.success("Payment recorded — bill marked paid");
    router.refresh();
  }

  async function doUnpaid() {
    if (!payInvoice) return;
    const res = await markInvoiceUnpaid(payInvoice.id);
    setPayInvoice(null);
    if (res.error) return toast.error(res.error);
    toast.success("Bill marked unpaid");
    router.refresh();
  }

  async function doCancel() {
    if (!cancelTarget) return;
    const res = await cancelInvoice(cancelTarget.id);
    setCancelTarget(null);
    if (res.error) return toast.error(res.error);
    toast.success("Bill cancelled");
    router.refresh();
  }

  async function copyPayLink(inv: Invoice) {
    await navigator.clipboard.writeText(`${location.origin}/pay/${inv.pay_token}`);
    toast.success("Payment link copied");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Billing</h1>
          <p className="text-sm text-slate-500">{invoices.length} bills</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setGenOpen(true)}>
            <Zap className="h-4 w-4" /> Generate Monthly Bills
          </Button>
          <Button
            onClick={() => {
              setForm((f) => ({ ...f, member_id: "", billing_month: monthKey() }));
              setAddOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Create Bill
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Paid", total("paid"), "emerald"],
          ["Pending", total("pending"), "amber"],
          ["Overdue", total("overdue"), "rose"],
          ["Bills", invoices.length, "slate"],
        ].map(([label, value, tone]) => (
          <Card key={label as string} className="p-4">
            <div className="text-xs font-medium text-slate-500">{label}</div>
            <div
              className={cn(
                "mt-1 text-lg font-bold",
                tone === "emerald" && "text-emerald-600",
                tone === "amber" && "text-amber-600",
                tone === "rose" && "text-rose-600",
                tone === "slate" && "text-slate-800"
              )}
            >
              {typeof value === "number" && label !== "Bills"
                ? formatCurrency(value)
                : value}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <Input
            placeholder="Search member…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-64"
          />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No bills"
            message="Generate monthly bills in one click, or create a bill manually."
            action={
              <Button onClick={() => setGenOpen(true)}>
                <Zap className="h-4 w-4" /> Generate Monthly Bills
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto scroll-x">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                  {["Member", "Month", "Amount", "Due", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {inv.member?.full_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{monthLabel(inv.billing_month)}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                    <td className="px-4 py-3">
                      <Badge status={inv.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(inv.status === "pending" || inv.status === "overdue") && (
                          <>
                            <button
                              onClick={() => setPayInvoice(inv)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Mark Paid
                            </button>
                            <button
                              onClick={() => copyPayLink(inv)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Copy className="h-3.5 w-3.5" /> Pay Link
                            </button>
                            <button
                              onClick={() => setCancelTarget(inv)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {inv.status === "paid" && (
                          <button
                            onClick={() => setPayInvoice(inv)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Unpay
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Generate monthly bills */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate Monthly Bills">
        <div className="space-y-4">
          <Field label="Billing Month">
            <Input type="month" value={month.slice(0, 7)} onChange={(e) => setMonth(e.target.value + "-01")} />
          </Field>
          <p className="text-xs text-slate-500">
            Creates bills for all active members who don&apos;t already have one this month.
            A unique DB constraint on <strong>member + month</strong> prevents duplicates.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doGenerate} loading={loading}>
              <Zap className="h-4 w-4" /> Generate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add bill */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Bill">
        <div className="space-y-4">
          <Field label="Member">
            <Select
              value={form.member_id}
              onChange={(e) => {
                const m = members.find((x) => x.id === e.target.value);
                setForm({ ...form, member_id: e.target.value, amount: Number(m?.monthly_fee ?? 1000) });
              }}
            >
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Billing Month">
            <Input
              type="month"
              value={form.billing_month.slice(0, 7)}
              onChange={(e) => setForm({ ...form, billing_month: e.target.value + "-01" })}
            />
          </Field>
          <Field label="Amount (₹)">
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Due Date">
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </Field>
          <Field label="Notes">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doAdd} loading={loading}>
              Create bill
            </Button>
          </div>
        </div>
      </Modal>

      {/* Mark paid */}
      <Modal
        open={!!payInvoice}
        onClose={() => setPayInvoice(null)}
        title={payInvoice?.status === "paid" ? "Revert payment" : "Mark bill as paid"}
      >
        <div className="space-y-4">
          {payInvoice?.status !== "paid" ? (
            <>
              <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <strong>{formatCurrency(payInvoice?.amount ?? 0)}</strong>
                </div>
              </div>
              <Field label="Payment Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as Payment["payment_method"])}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
              <Field label="Reference (optional)" hint="UTR / transaction ID">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </>
          ) : (
            <p className="text-sm text-slate-600">
              This will remove the payment record and set the bill back to pending.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayInvoice(null)}>
              Cancel
            </Button>
            {payInvoice?.status === "paid" ? (
              <Button onClick={doUnpaid} loading={loading}>
                Revert to unpaid
              </Button>
            ) : (
              <Button onClick={doPay} loading={loading}>
                <CheckCircle2 className="h-4 w-4" /> Confirm payment
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel bill?"
        message="The bill will be marked cancelled and removed from totals."
        confirmLabel="Cancel bill"
        danger
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
