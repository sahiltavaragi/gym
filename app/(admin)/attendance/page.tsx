import { createAdminClient } from "@/lib/supabase-server";
import { AttendanceClient } from "./attendance-client";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const supabase = createAdminClient();
  const [{ data: settings }, { data: members }] = await Promise.all([
    supabase.from("gym_attendance_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("members").select("id, full_name, status").order("full_name"),
  ]);

  return (
    <AttendanceClient
      settings={settings ?? null}
      members={(members ?? []) as { id: string; full_name: string; status: string }[]}
    />
  );
}
