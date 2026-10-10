import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { MemberProfile } from "./member-profile";
import type { AttendanceRecord, MemberAttendanceToken } from "@/lib/types";

export const revalidate = 60;

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [
    { data: member },
    { data: assessments },
    { data: invoices },
    { data: payments },
    { data: reports },
    { data: plans },
    { data: attendanceToken },
    { data: attendanceRows },
    { data: attendanceSettings },
  ] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("health_assessments")
      .select("*")
      .eq("member_id", id)
      .order("assessment_date", { ascending: false }),
    supabase
      .from("invoices")
      .select("*")
      .eq("member_id", id)
      .order("billing_month", { ascending: false }),
    supabase
      .from("payments")
      .select("*")
      .eq("member_id", id)
      .order("payment_date", { ascending: false }),
    supabase
      .from("health_reports")
      .select("*")
      .eq("member_id", id)
      .order("report_month", { ascending: false }),
    supabase.from("membership_plans").select("*"),
    supabase
      .from("member_attendance_tokens")
      .select("id, created_at, expires_at, revoked_at, created_by")
      .eq("member_id", id)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("*")
      .eq("member_id", id)
      .order("check_in_at", { ascending: false })
      .limit(50),
    supabase.from("gym_attendance_settings").select("timezone").eq("id", 1).maybeSingle(),
  ]);

  if (!member) notFound();

  return (
    <MemberProfile
      member={member}
      assessments={assessments ?? []}
      invoices={invoices ?? []}
      payments={payments ?? []}
      reports={reports ?? []}
      plans={plans ?? []}
      attendanceToken={(attendanceToken ?? null) as MemberAttendanceToken | null}
      attendance={(attendanceRows ?? []) as AttendanceRecord[]}
      timezone={attendanceSettings?.timezone ?? "Asia/Kolkata"}
    />
  );
}
