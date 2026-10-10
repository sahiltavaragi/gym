"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type { GymSettings } from "@/lib/types";

export async function updateSettings(input: Partial<GymSettings>) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("gym_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .select()
    .single();
  if (error) return { error: error.message };
  await logAudit("Settings Updated", "gym_settings", undefined, {
    keys: Object.keys(input),
  });
  revalidatePath("/settings");
  return { data };
}

export async function uploadQr(file: File): Promise<{ url?: string; error?: string }> {
  const supabase = createAdminClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `upi-qr/qr-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("gym-media")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { error: error.message };
  const {
    data: { publicUrl },
  } = supabase.storage.from("gym-media").getPublicUrl(path);
  return { url: publicUrl };
}
