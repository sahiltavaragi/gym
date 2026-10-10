"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type { GymSettings, Member } from "@/lib/types";

// ---------------------------------------------------------------------------
// Provider abstraction — swap implementations without touching callers.
// ---------------------------------------------------------------------------
export interface WhatsAppProvider {
  name: string;
  send(to: string, body: string): Promise<{ id: string }>;
}

// "manual" provider: opens wa.me link client-side; we log intent + status.
// To plug in a real WhatsApp Business API, implement WhatsAppProvider here
// (or call an Edge Function that stores the credentials as secrets).
const manualProvider: WhatsAppProvider = {
  name: "manual",
  async send() {
    return { id: "manual-" + Date.now() };
  },
};

export async function getProvider(): Promise<WhatsAppProvider> {
  // Future: read provider name from env/secrets and return the right impl.
  return manualProvider;
}

const DEFAULT_TEMPLATE = `🏋️ YOUR MONTHLY GYM REPORT

Hello {{member_name}},

Your {{month}} health report is ready.

⚖️ Weight: {{current_weight}} kg
📉 Previous: {{previous_weight}} kg
💪 Body Fat: {{body_fat}}%
📏 Waist: {{waist}} cm

💰 Monthly Fee: {{amount}}
📅 Due Date: {{due_date}}

📄 View Health Report:
{{report_link}}

💳 PAYMENT OPTIONS

🟢 UPI
UPI ID: {{upi_id}}
Please scan the attached QR code to pay {{amount}}.

💵 CASH
{{cash_payment_instructions}}

Thank you! 💪`;

function render(
  tpl: string,
  vars: Record<string, string>
) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export type MonthlyBundleResult = {
  reportId?: string;
  invoiceId?: string;
  reportLink?: string;
  message?: string;
  error?: string;
  report?: {
    id: string;
    share_token: string;
    current_assessment_id: string;
    previous_assessment_id: string | null;
  };
};

// One-click: report + bill + links + WhatsApp draft (never duplicates).
export async function prepareMonthlyBundle(memberId: string, month: string) {
  const supabase = createAdminClient();

  const { data: member, error: mErr } = await supabase
    .from("members")
    .select("*")
    .eq("id", memberId)
    .single();
  if (mErr || !member) return { error: "Member not found." } as MonthlyBundleResult;

  const { data: settings } = await supabase
    .from("gym_settings")
    .select("*")
    .single();

  // 1. health report (upsert — no duplicates)
  const gen = await generateReportInternal(memberId, month);
  if (gen.error) return { error: gen.error } as MonthlyBundleResult;

  // 2. invoice (upsert guarded by unique constraint)
  const dueDay = settings?.default_due_day ?? 10;
  const dueDate = `${month.slice(0, 7)}-${String(Math.min(dueDay, 28)).padStart(2, "0")}`;
  let invoice = (
    await supabase
      .from("invoices")
      .select("*")
      .eq("member_id", memberId)
      .eq("billing_month", month)
      .maybeSingle()
  ).data;

  if (!invoice) {
    const { data: created, error: iErr } = await supabase
      .from("invoices")
      .insert({
        member_id: memberId,
        billing_month: month,
        amount: member.monthly_fee ?? settings?.default_monthly_fee ?? 1000,
        due_date: dueDate,
        status: "pending",
      })
      .select()
      .single();
    if (iErr && iErr.code !== "23505") return { error: iErr.message } as MonthlyBundleResult;
    invoice = created;
  }

  const origin = (await headers()).get("origin") ?? "";
  const reportLink = gen.report
    ? `${origin}/report/${gen.report.share_token}`
    : "";
  const payLink = invoice ? `${origin}/pay/${invoice.pay_token}` : "";

  const { data: assessment } = await supabase
    .from("health_assessments")
    .select("*")
    .eq("id", gen.report?.current_assessment_id ?? "")
    .maybeSingle();

  const { data: prev } = await supabase
    .from("health_assessments")
    .select("*")
    .eq("id", gen.report?.previous_assessment_id ?? "")
    .maybeSingle();

  const monthName = new Date(month).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const body = render(settings?.whatsapp_template || DEFAULT_TEMPLATE, {
    member_name: member.full_name,
    month: monthName,
    current_weight: assessment?.weight_kg ?? "—",
    previous_weight: prev?.weight_kg ?? assessment?.weight_kg ?? "—",
    body_fat: assessment?.body_fat_pct ?? "—",
    waist: assessment?.waist_cm ?? "—",
    amount: invoice ? `₹${Number(invoice.amount).toLocaleString("en-IN")}` : "—",
    due_date: invoice
      ? new Date(invoice.due_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—",
    report_link: reportLink,
    pay_link: payLink,
    upi_id: settings?.upi_id ?? "—",
    cash_payment_instructions:
      settings?.cash_payment_instructions ?? "Pay at the reception counter.",
  });

  return {
    reportId: gen.report?.id,
    invoiceId: invoice?.id,
    reportLink,
    message: body,
  } as MonthlyBundleResult;
}

async function generateReportInternal(memberId: string, reportMonth: string) {
  const supabase = createAdminClient();
  let { data: assessments } = await supabase
    .from("health_assessments")
    .select("*")
    .eq("member_id", memberId)
    .lte("assessment_date", reportMonth.slice(0, 7) + "-31")
    .order("assessment_date", { ascending: false })
    .limit(2);

  let cur = assessments?.[0] ?? null;
  if (!cur) {
    const { data: created, error: cErr } = await supabase
      .from("health_assessments")
      .insert({
        member_id: memberId,
        assessment_date: reportMonth,
        notes: "Baseline assessment created automatically for this member.",
        trainer_notes: "Initial baseline created when the report was generated.",
      })
      .select()
      .single();
    if (cErr) return { error: cErr.message } as MonthlyBundleResult;
    cur = created;
    assessments = [created];
  }

  const prev = assessments?.[1] ?? null;

  const { data, error } = await supabase
    .from("health_reports")
    .upsert(
      {
        member_id: memberId,
        report_month: reportMonth,
        current_assessment_id: cur.id,
        previous_assessment_id: prev?.id ?? null,
        trainer_notes: cur.trainer_notes,
      },
      { onConflict: "member_id,report_month" }
    )
    .select()
    .single();
  if (error) return { error: error.message } as MonthlyBundleResult;
  return {
    report: {
      id: data.id as string,
      share_token: data.share_token as string,
      current_assessment_id: data.current_assessment_id as string,
      previous_assessment_id: (data.previous_assessment_id as string | null) ?? null,
    },
  } as { report: { id: string; share_token: string; current_assessment_id: string; previous_assessment_id: string | null } } & MonthlyBundleResult;
}

// Send / log a message
export async function sendWhatsApp(input: {
  member_id: string;
  invoice_id?: string | null;
  health_report_id?: string | null;
  phone: string | null;
  body: string;
  report_link?: string | null;
  status?: "pending" | "sent" | "delivered" | "failed";
}) {
  const supabase = createAdminClient();
  const provider = await getProvider();

  let providerMessageId: string | null = null;
  let status = input.status ?? "pending";
  let errorMessage: string | null = null;

  // The actual send is intentionally opt-in: manual mode just logs the
  // message as "sent" so the admin can copy/open it in WhatsApp.
  if (input.phone && status === "sent") {
    try {
      const res = await provider.send(input.phone, input.body);
      providerMessageId = res.id;
    } catch (e) {
      status = "failed";
      errorMessage = e instanceof Error ? e.message : "Unknown provider error";
    }
  }

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      member_id: input.member_id,
      invoice_id: input.invoice_id ?? null,
      health_report_id: input.health_report_id ?? null,
      phone: input.phone,
      body: input.body,
      report_link: input.report_link ?? null,
      status,
      provider: provider.name,
      provider_message_id: providerMessageId,
      error_message: errorMessage,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await logAudit("WhatsApp Sent", "whatsapp_message", data.id, { status });
  revalidatePath("/whatsapp");
  return { data };
}

export async function updateMessageStatus(id: string, status: "sent" | "delivered" | "failed") {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("whatsapp_messages")
    .update({ status, sent_at: status === "sent" ? new Date().toISOString() : undefined })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/whatsapp");
  return {};
}
