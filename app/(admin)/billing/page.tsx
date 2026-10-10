import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase-server";
import { BillingClient } from "./billing-client";

export const revalidate = 60;

export default async function BillingPage() {
  const supabase = createAdminClient();
  const [{ data: invoices }, { data: members }, { data: settings }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, member:members(id, full_name, status, whatsapp_number)")
      .order("billing_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("members")
      .select("id, full_name, status, monthly_fee, membership_end_date")
      .order("full_name"),
    supabase.from("gym_settings").select("*").single(),
  ]);

  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading billing…</div>}>
      <BillingClient
        invoices={(invoices ?? []) as never}
        members={members ?? []}
        settings={settings ?? null}
      />
    </Suspense>
  );
}
