import { createAdminClient } from "@/lib/supabase-server";
import { SettingsClient } from "./settings-client";

export const revalidate = 60;

export default async function SettingsPage() {
  const supabase = createAdminClient();
  const [{ data: settings }, { data: plans }] = await Promise.all([
    supabase.from("gym_settings").select("*").single(),
    supabase.from("membership_plans").select("*").order("name"),
  ]);

  return <SettingsClient settings={settings ?? null} plans={plans ?? []} />;
}
