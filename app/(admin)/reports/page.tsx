import { createAdminClient } from "@/lib/supabase-server";
import { ReportsClient } from "./reports-client";

export const revalidate = 60;

export default async function ReportsPage() {
  const supabase = createAdminClient();
  const [membersRes, invoicesRes, paymentsRes, reportsRes, messagesRes, auditRes] = await Promise.all([
    supabase.from("members").select("id, status, created_at"),
    supabase.from("invoices").select("id, amount, status, billing_month, due_date"),
    supabase.from("payments").select("id, amount, payment_date, payment_method"),
    supabase.from("health_reports").select("id, created_at, report_month"),
    supabase.from("whatsapp_messages").select("id, status, created_at"),
    supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const members = membersRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const reports = reportsRes.data ?? [];
  const messages = messagesRes.data ?? [];
  const audit = auditRes.data ?? [];

  return (
    <ReportsClient
      members={members as never}
      invoices={invoices as never}
      payments={payments as never}
      reports={reports as never}
      messages={messages as never}
      audit={audit as never}
    />
  );
}
