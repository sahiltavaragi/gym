"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type { Member } from "@/lib/types";

export type MemberInput = Partial<Member> & { full_name: string };

export async function createMember(input: MemberInput) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .insert(input)
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Member Created", "member", data.id, { name: input.full_name });
  revalidatePath("/members");
  return { data };
}

export async function updateMember(id: string, input: Partial<Member>) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Member Updated", "member", id);
  revalidatePath("/members");
  return { data };
}

export async function archiveMember(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ status: "inactive" })
    .eq("id", id);
  if (error) return { error: error.message };
  await logAudit("Member Deleted", "member", id);
  revalidatePath("/members");
  return {};
}
