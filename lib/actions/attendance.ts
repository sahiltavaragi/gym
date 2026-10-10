"use server";

import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import type {
  AttendanceRecord,
  AttendanceSettings,
  DuplicatePolicy,
  QrMode,
} from "@/lib/types";
import {
  generateConfirmationReference,
  generateMemberToken,
  hashToken,
  isValidTimeZone,
  localDateIn,
} from "@/lib/attendance/core";

/** Every admin attendance action verifies the caller's session first. */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, error: "Not authorized." };
  return { user, error: null };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeSearch(term: string) {
  return term.replace(/[^0-9a-zA-Z ]/g, "").trim();
}

export interface AttendanceSettingsInput {
  gym_name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  max_gps_accuracy_meters: number;
  timezone: string;
  qr_validity_seconds: number;
  qr_mode: QrMode;
  duplicate_policy: DuplicatePolicy;
  confirmed?: boolean;
}

export async function saveAttendanceSettings(input: AttendanceSettingsInput) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const gym_name = (input.gym_name ?? "").trim();
  if (!gym_name || gym_name.length > 100) return { error: "Gym name is required." };
  if (!isValidTimeZone(input.timezone))
    return { error: "Invalid timezone. Use an IANA name like Asia/Kolkata." };

  const hasCoords = input.latitude != null && input.longitude != null;
  if (hasCoords) {
    const lat = Number(input.latitude);
    const lng = Number(input.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90)
      return { error: "Latitude must be between -90 and 90." };
    if (!Number.isFinite(lng) || lng < -180 || lng > 180)
      return { error: "Longitude must be between -180 and 180." };
  }

  const radius = Math.round(Number(input.allowed_radius_meters));
  const accuracy = Math.round(Number(input.max_gps_accuracy_meters));
  const validity = Math.round(Number(input.qr_validity_seconds));
  if (!Number.isFinite(radius) || radius < 10 || radius > 1000)
    return { error: "Allowed radius must be between10 and1000 metres." };
  if (!Number.isFinite(accuracy) || accuracy < 5 || accuracy > 1000)
    return { error: "Max GPS accuracy must be between5 and1000 metres." };
  if (!Number.isFinite(validity) || validity < 15 || validity > 3600)
    return { error: "QR validity must be between15 seconds and1 hour." };

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("gym_attendance_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const coordsChanged =
    Number(current?.latitude ?? 0) !== (hasCoords ? Number(input.latitude) : 0) ||
    Number(current?.longitude ?? 0) !== (hasCoords ? Number(input.longitude) : 0);

  // Review gate: coordinates must be confirmed before they go live.
  if (hasCoords && coordsChanged && !input.confirmed) {
    return { error: "REVIEW_REQUIRED" };
  }

  const payload = {
    gym_name,
    latitude: hasCoords ? Number(input.latitude) : null,
    longitude: hasCoords ? Number(input.longitude) : null,
    allowed_radius_meters: radius,
    max_gps_accuracy_meters: accuracy,
    timezone: input.timezone,
    qr_validity_seconds: validity,
    qr_mode: input.qr_mode,
    duplicate_policy: input.duplicate_policy,
    location_configured: hasCoords,
    updated_at: new Date().toISOString(),
    updated_by: user!.id,
  };

  const { data, error } = await supabase
    .from("gym_attendance_settings")
    .update(payload)
    .eq("id", 1)
    .select()
    .single();
  if (error) return { error: error.message };

  // Switching QR mode invalidates outstanding tokens so a permanent QR
  // cannot keep working after rotating mode is enabled (and vice versa).
  if (current && current.qr_mode !== input.qr_mode) {
    await supabase
      .from("attendance_qr_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .is("revoked_at", null);
  }

  await logAudit("Attendance Settings Updated", "gym_attendance_settings", undefined, {
    keys: Object.keys(payload),
    location_configured: payload.location_configured,
    qr_mode: payload.qr_mode,
  });
  revalidatePath("/settings/attendance");
  revalidatePath("/attendance/qr");
  return { data: data as AttendanceSettings };
}

export interface AttendanceQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  date?: string;
  memberId?: string;
}

async function resolveMemberFilter(
  supabase: ReturnType<typeof createAdminClient>,
  search?: string
): Promise<string[] | null> {
  const term = sanitizeSearch(search ?? "");
  if (!term) return null; // no search → no member-id restriction
  const { data } = await supabase
    .from("members")
    .select("id")
    .or(`full_name.ilike.%${term}%,phone_number.ilike.%${term}%`)
    .limit(200);
  return (data ?? []).map((m) => m.id); // empty array → no matches
}

/**
 * NOTE: query builders must never be returned from async functions —
 * awaiting the promise would flatten (and execute) the thenable chain.
 * Member-id resolution is awaited first; the builder stays synchronous.
 */
function attendanceQuery(
  supabase: ReturnType<typeof createAdminClient>,
  query: AttendanceQuery,
  memberIds: string[] | null
) {
  // null → caller returns an empty result (search matched no members)
  if (memberIds && memberIds.length === 0) return null;
  let q = supabase
    .from("attendance")
    .select("*, member:members(id, full_name, phone_number, status)", { count: "exact" });
  if (memberIds) q = q.in("member_id", memberIds);
  if (query.date && DATE_RE.test(query.date)) q = q.eq("attendance_date", query.date);
  if (query.memberId) q = q.eq("member_id", query.memberId);
  return q;
}

export type AttendanceListResult =
  | { error: string }
  | { data: AttendanceRecord[]; count: number; page: number; pageSize: number };

export async function listAttendance(query: AttendanceQuery): Promise<AttendanceListResult> {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.floor(query.pageSize ?? 15)));
  const supabase = createAdminClient();

  const memberIds = await resolveMemberFilter(supabase, query.search);
  const q = attendanceQuery(supabase, query, memberIds);
  if (!q) return { data: [], count: 0, page, pageSize };

  const from = (page - 1) * pageSize;
  const { data, error, count } = await q
    .order("check_in_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return { error: error.message };
  return { data: (data ?? []) as AttendanceRecord[], count: count ?? 0, page, pageSize };
}

export async function getAttendanceStats() {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const supabase = createAdminClient();
  const [{ data: settings }, { count: activeMembers }] = await Promise.all([
    supabase.from("gym_attendance_settings").select("*").eq("id", 1).maybeSingle(),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "expiring_soon"]),
  ]);
  const tz = settings?.timezone ?? "Asia/Kolkata";
  const today = localDateIn(tz);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [{ count: todayCount }, { count: monthCount }] = await Promise.all([
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("attendance_date", today)
      .eq("status", "present"),
    supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .gte("attendance_date", monthStart)
      .lte("attendance_date", today)
      .eq("status", "present"),
  ]);

  const active = activeMembers ?? 0;
  const checkedIn = todayCount ?? 0;
  return {
    data: {
      todayCount: checkedIn,
      activeMembers: active,
      notCheckedIn: Math.max(0, active - checkedIn),
      monthCount: monthCount ?? 0,
      localDate: today,
      timezone: tz,
    },
  };
}

export async function getAttendanceForExport(query: AttendanceQuery) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const supabase = createAdminClient();
  const memberIds = await resolveMemberFilter(supabase, query.search);
  const q = attendanceQuery(supabase, query, memberIds);
  if (!q) return { data: [] as AttendanceRecord[] };
  const { data, error } = await q
    .order("check_in_at", { ascending: false })
    .limit(5000);
  if (error) return { error: error.message };
  return { data: (data ?? []) as AttendanceRecord[] };
}

export async function getMemberAttendanceHistory(memberId: string) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("*, member:members(id, full_name, phone_number, status)")
    .eq("member_id", memberId)
    .order("check_in_at", { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  return { data: (data ?? []) as AttendanceRecord[] };
}

export async function recordManualAttendance(input: {
  memberId: string;
  date?: string;
  reason?: string;
}) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  if (!input.memberId) return { error: "Select a member." };
  if (input.date && !DATE_RE.test(input.date)) return { error: "Invalid date." };

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("gym_attendance_settings")
    .select("timezone")
    .eq("id", 1)
    .maybeSingle();

  const attendance_date = input.date ?? localDateIn(settings?.timezone ?? "Asia/Kolkata");
  const { data, error } = await supabase
    .from("attendance")
    .insert({
      member_id: input.memberId,
      attendance_date,
      verification_method: "manual",
      recorded_by: user!.id,
      confirmation_reference: generateConfirmationReference(),
    })
    .select("*, member:members(id, full_name, phone_number, status)")
    .single();
  if (error) {
    if (error.message.includes("ATTENDANCE_DUPLICATE"))
      return { error: "Attendance already recorded for this member on that date." };
    return { error: error.message };
  }

  await logAudit("Attendance Recorded (Manual)", "attendance", data.id, {
    member_id: input.memberId,
    attendance_date,
    reason: input.reason ?? null,
  });
  revalidatePath("/attendance");
  return { data: data as AttendanceRecord };
}

export async function voidAttendance(id: string, reason: string) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < 3) return { error: "A reason is required to correct attendance." };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance")
    .update({
      status: "voided",
      correction_reason: trimmed,
      corrected_by: user!.id,
      corrected_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "present")
    .select("*, member:members(id, full_name, phone_number, status)")
    .single();
  if (error) return { error: error.message };
  if (!data) return { error: "Record not found or already corrected." };

  await logAudit("Attendance Voided", "attendance", id, { reason: trimmed });
  revalidatePath("/attendance");
  return { data: data as AttendanceRecord };
}

/**
 * Generates (or regenerates) the member's attendance identity token.
 * The plaintext token + personal link are returned exactly once and are
 * never stored, logged, or shown again — only the SHA-256 hash is kept.
 */
export async function regenerateMemberAttendanceToken(memberId: string) {
  const { user, error: authError } = await requireAdmin();
  if (authError) return { error: authError };
  if (!memberId) return { error: "Member not found." };

  const supabase = createAdminClient();
  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) return { error: "Member not found." };

  const token = generateMemberToken();
  const { error } = await supabase.from("member_attendance_tokens").upsert(
    {
      member_id: memberId,
      token_hash: hashToken(token),
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked_at: null,
      created_by: user!.id,
    },
    { onConflict: "member_id" }
  );
  if (error) return { error: error.message };

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const url = `${base}/attend/me/${token}`;
  // Audit intentionally records that a token was rotated, never its value.
  await logAudit("Attendance Token Regenerated", "member_attendance_tokens", undefined, {
    member_id: memberId,
  });
  revalidatePath(`/members/${memberId}`);
  return { token, url, memberName: member.full_name };
}

export async function revokeMemberAttendanceToken(memberId: string) {
  const { error: authError } = await requireAdmin();
  if (authError) return { error: authError };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("member_attendance_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("member_id", memberId)
    .is("revoked_at", null);
  if (error) return { error: error.message };

  await logAudit("Attendance Token Revoked", "member_attendance_tokens", undefined, {
    member_id: memberId,
  });
  revalidatePath(`/members/${memberId}`);
  return {};
}
