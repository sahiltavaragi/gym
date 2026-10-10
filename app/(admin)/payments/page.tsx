import { createAdminClient } from "@/lib/supabase-server";
import { PaymentsClient } from "./payments-client";

export const revalidate = 60;

export default async function PaymentsPage() {
  const supabase = createAdminClient();
  const [{ data: payments }, { data: invoices }] = await Promise.all([
    supabase
      .from("payments")
      .select("*, member:members(id, full_name), invoice:invoices(id, billing_month, pay_token)")
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("invoices")
      .select("id, member_id, billing_month, amount, status, member:members(full_name)")
      .neq("status", "paid")
      .order("billing_month", { ascending: false })
      .limit(300),
  ]);

  return (
    <PaymentsClient payments={(payments ?? []) as never} unpaid={(invoices ?? []) as never} />
  );
}
