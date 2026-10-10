import { createClient, createAdminClient } from "@/lib/supabase-server";

export async function logAudit(
  action: string,
  entity?: string,
  entity_id?: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = createAdminClient();
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    await supabase.from("audit_logs").insert({
      admin_id: user?.id ?? null,
      action,
      entity: entity ?? null,
      entity_id: entity_id ?? null,
      details: details ?? null,
    });
  } catch {
    // never break the main flow because of audit logging
  }
}
