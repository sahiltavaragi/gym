"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type { HealthAssessment } from "@/lib/types";

export type AssessmentInput = Omit<HealthAssessment, "id" | "bmi" | "created_at"> & {
  bmi?: number | null;
};

export async function addAssessment(input: AssessmentInput) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("health_assessments")
    .upsert(input, { onConflict: "member_id,assessment_date" })
    .select()
    .single();
  if (error) {
    if (error.code === "23505")
      return { error: "An assessment already exists for this date." };
    return { error: error.message };
  }
  await logAudit("Health Assessment Saved", "health_assessment", data.id);
  revalidatePath("/health");
  revalidatePath(`/members/${input.member_id}`);
  return { data };
}

export async function generateHealthReport(memberId: string, reportMonth: string) {
  const supabase = createAdminClient();

  // fetch latest two assessments on/before report month end
  const { data: assessments, error: aErr } = await supabase
    .from("health_assessments")
    .select("*")
    .eq("member_id", memberId)
    .lte("assessment_date", reportMonth.slice(0, 7) + "-31")
    .order("assessment_date", { ascending: false })
    .limit(2);
  if (aErr) return { error: aErr.message };

  let current = assessments?.[0] ?? null;
  let previous = assessments?.[1] ?? null;
  if (!current) {
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
    if (cErr) return { error: cErr.message };
    current = created;
    previous = null;
  }

  const summary = buildSummary(current, previous);

  const { data, error } = await supabase
    .from("health_reports")
    .upsert(
      {
        member_id: memberId,
        report_month: reportMonth,
        current_assessment_id: current.id,
        previous_assessment_id: previous?.id ?? null,
        summary_text: summary,
        trainer_notes: current.trainer_notes,
        share_token: crypto.randomUUID(),
        token_revoked: false,
      },
      { onConflict: "member_id,report_month" }
    )
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Health Report Created", "health_report", data.id);
  revalidatePath("/health");
  return { data };
}

function buildSummary(
  cur: Partial<HealthAssessment>,
  prev: Partial<HealthAssessment> | null
) {
  const parts: string[] = [];
  if (prev?.weight_kg && cur.weight_kg) {
    const diff = Number(cur.weight_kg) - Number(prev.weight_kg);
    if (Math.abs(diff) >= 0.1)
      parts.push(
        `Weight ${diff < 0 ? "down" : "up"} ${Math.abs(diff).toFixed(1)} kg (${prev.weight_kg} → ${cur.weight_kg} kg).`
      );
  }
  if (prev?.body_fat_pct && cur.body_fat_pct) {
    const diff = Number(cur.body_fat_pct) - Number(prev.body_fat_pct);
    if (Math.abs(diff) >= 0.1)
      parts.push(`Body fat ${diff < 0 ? "reduced" : "increased"} by ${Math.abs(diff).toFixed(1)}%.`);
  }
  if (prev?.waist_cm && cur.waist_cm) {
    const diff = Number(cur.waist_cm) - Number(prev.waist_cm);
    if (Math.abs(diff) >= 0.5)
      parts.push(`Waist ${diff < 0 ? "reduced" : "increased"} by ${Math.abs(diff).toFixed(0)} cm.`);
  }
  if (!parts.length) parts.push("No significant changes this period. Keep up the consistency!");
  else parts.push("Great progress this month.");
  return parts.join(" ");
}

export async function revokeReportToken(reportId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("health_reports")
    .update({ token_revoked: true, share_token: crypto.randomUUID() })
    .eq("id", reportId);
  if (error) return { error: error.message };
  await logAudit("Report Token Revoked", "health_report", reportId);
  return {};
}
