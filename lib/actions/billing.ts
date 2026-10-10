"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type { Invoice, Payment } from "@/lib/types";

export type InvoiceInput = Pick<
  Invoice,
  "member_id" | "billing_month" | "amount" | "due_date" | "notes"
> & { status?: Invoice["status"] };

export async function createInvoice(input: InvoiceInput) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invoices")
    .insert({ ...input, status: input.status ?? "pending" })
    .select()
    .single();
  if (error) {
    if (error.code === "23505")
      return { error: "A bill for this member and month already exists." };
    return { error: error.message };
  }
  await logAudit("Invoice Created", "invoice", data.id);
  revalidatePath("/billing");
  return { data };
}

export async function updateInvoice(
  id: string,
  input: Partial<Invoice>
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invoices")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Invoice Updated", "invoice", id, { ...input });
  revalidatePath("/billing");
  return { data };
}

export async function generateMonthlyBills(billingMonth: string, dueDay: number) {
  const supabase = createAdminClient();

  const { data: settings, error: sErr } = await supabase
    .from("gym_settings")
    .select("*")
    .single();
  if (sErr) return { error: sErr.message };

  const { data: members, error: mErr } = await supabase
    .from("members")
    .select("id, full_name, monthly_fee, membership_end_date")
    .in("status", ["active", "expiring_soon"]);
  if (mErr) return { error: mErr.message };

  const { data: existing, error: eErr } = await supabase
    .from("invoices")
    .select("member_id")
    .eq("billing_month", billingMonth);
  if (eErr) return { error: eErr.message };

  const existingSet = new Set((existing ?? []).map((e) => e.member_id));
  const dueDate = `${billingMonth.slice(0, 7)}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;

  const rows = (members ?? [])
    .filter((m) => !existingSet.has(m.id))
    .filter(
      (m) => !m.membership_end_date || m.membership_end_date >= billingMonth.slice(0, 7) + "-01"
    )
    .map((m) => ({
      member_id: m.id,
      billing_month: billingMonth,
      amount: m.monthly_fee ?? settings.default_monthly_fee,
      due_date: dueDate,
      status: "pending",
    }));

  if (rows.length === 0) return { data: { created: 0, skipped: existingSet.size } };

  const { error } = await supabase.from("invoices").insert(rows);
  if (error) {
    if (error.code === "23505")
      return { error: "Duplicate bills blocked by unique constraint — some were skipped." };
    return { error: error.message };
  }
  await logAudit("Monthly Bills Generated", "invoice", undefined, {
    month: billingMonth,
    created: rows.length,
  });
  revalidatePath("/billing");
  return { data: { created: rows.length, skipped: existingSet.size } };
}

export async function markInvoicePaid(
  invoiceId: string,
  method: Payment["payment_method"],
  reference?: string
) {
  const supabase = createAdminClient();

  const { data: invoice, error: iErr } = await supabase
    .from("invoices")
    .select("id, member_id, amount")
    .eq("id", invoiceId)
    .single();
  if (iErr || !invoice) return { error: "Invoice not found." };

  // transaction-like: create payment then mark paid
  const { error: pErr } = await supabase.from("payments").insert({
    invoice_id: invoice.id,
    member_id: invoice.member_id,
    amount: invoice.amount,
    payment_method: method,
    payment_date: new Date().toISOString().slice(0, 10),
    reference: reference ?? null,
    confirmed_by_admin: true,
  });
  if (pErr) return { error: pErr.message };

  const { error: uErr } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      payment_method: method,
      payment_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", invoiceId);
  if (uErr) return { error: uErr.message };

  await logAudit("Payment Confirmed", "invoice", invoiceId, { method });
  revalidatePath("/billing");
  revalidatePath("/payments");
  return {};
}

export async function markInvoiceUnpaid(invoiceId: string) {
  const supabase = createAdminClient();
  // remove payment records for this invoice first
  await supabase.from("payments").delete().eq("invoice_id", invoiceId);
  const { error } = await supabase
    .from("invoices")
    .update({ status: "pending", payment_method: null, payment_date: null })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  await logAudit("Invoice Marked Unpaid", "invoice", invoiceId);
  revalidatePath("/billing");
  return {};
}

export async function cancelInvoice(invoiceId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId);
  if (error) return { error: error.message };
  await logAudit("Invoice Cancelled", "invoice", invoiceId);
  revalidatePath("/billing");
  return {};
}

export async function createPayment(input: {
  invoice_id: string;
  amount: number;
  payment_method: Payment["payment_method"];
  payment_date: string;
  reference?: string;
}) {
  const supabase = createAdminClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("member_id")
    .eq("id", input.invoice_id)
    .single();
  if (!inv) return { error: "Invoice not found." };

  const { data, error } = await supabase
    .from("payments")
    .insert({ ...input, member_id: inv.member_id, confirmed_by_admin: true })
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Payment Added", "payment", data.id);
  revalidatePath("/payments");
  return { data };
}
