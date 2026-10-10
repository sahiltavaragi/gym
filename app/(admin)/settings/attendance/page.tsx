import { createAdminClient } from "@/lib/supabase-server";
import { AttendanceSettingsClient } from "./attendance-settings-client";

export const dynamic = "force-dynamic";

export default async function AttendanceSettingsPage() {
  const supabase = createAdminClient();
  const [{ data: settings }, { data: gym }] = await Promise.all([
    supabase.from("gym_attendance_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("gym_settings").select("logo_url").eq("id", 1).maybeSingle(),
  ]);

  return (
    <AttendanceSettingsClient
      settings={settings ?? null}
      logoUrl={gym?.logo_url ?? null}
    />
  );
}
