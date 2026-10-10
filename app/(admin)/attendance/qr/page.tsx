import { createAdminClient } from "@/lib/supabase-server";
import { QrDisplay } from "./qr-display";

export const dynamic = "force-dynamic";

export default async function AttendanceQrPage() {
  const supabase = createAdminClient();
  const [{ data: settings }, { data: gym }] = await Promise.all([
    supabase.from("gym_attendance_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("gym_settings").select("gym_name, logo_url").eq("id", 1).maybeSingle(),
  ]);

  return (
    <QrDisplay
      settings={settings ?? null}
      gymName={gym?.gym_name ?? "Gym"}
      logoUrl={gym?.logo_url ?? null}
    />
  );
}
