import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase-server";
import { WhatsAppClient } from "./whatsapp-client";

export const revalidate = 60;

export default async function WhatsAppPage() {
  const supabase = createAdminClient();
  const [{ data: members }, { data: messages }, { data: settings }] = await Promise.all([
    supabase
      .from("members")
      .select("id, full_name, whatsapp_number, status")
      .order("full_name"),
    supabase
      .from("whatsapp_messages")
      .select("*, member:members(id, full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("gym_settings").select("*").single(),
  ]);

  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading WhatsApp…</div>}>
      <WhatsAppClient
        members={members ?? []}
        messages={(messages ?? []) as never}
        settings={settings ?? null}
      />
    </Suspense>
  );
}
