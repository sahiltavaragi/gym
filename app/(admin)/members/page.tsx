import { createAdminClient } from "@/lib/supabase-server";
import { MembersClient } from "./members-client";

export const revalidate = 60;

export default async function MembersPage() {
  const supabase = createAdminClient();
  const [{ data: members }, { data: plans }] = await Promise.all([
    supabase
      .from("members")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("membership_plans").select("*").eq("is_active", true),
  ]);

  return <MembersClient members={members ?? []} plans={plans ?? []} />;
}
