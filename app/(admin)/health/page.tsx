import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase-server";
import { HealthClient } from "./health-client";

export const revalidate = 60;

export default async function HealthPage() {
  const supabase = createAdminClient();
  const [{ data: members }, { data: assessments }, { data: reports }, { data: settings }] =
    await Promise.all([
      supabase.from("members").select("id, full_name, status, whatsapp_number").order("full_name"),
      supabase
        .from("health_assessments")
        .select("*")
        .order("assessment_date", { ascending: false })
        .limit(200),
      supabase
        .from("health_reports")
        .select("*")
        .order("report_month", { ascending: false }),
      supabase.from("gym_settings").select("*").single(),
    ]);

  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading health dashboard…</div>}>
      <HealthClient
        members={members ?? []}
        assessments={assessments ?? []}
        reports={reports ?? []}
        settings={settings ?? null}
      />
    </Suspense>
  );
}
