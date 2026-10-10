import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import type { AttendanceSettings } from "@/lib/types";
import {
  hashToken,
  localDateIn,
  normalizeToken,
  type MemberTokenState,
  type QrTokenState,
} from "./core";

export async function loadAttendanceSettings(): Promise<AttendanceSettings | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("gym_attendance_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as AttendanceSettings | null) ?? null;
}

export async function isLocationConfigured(settings: AttendanceSettings | null) {
  return !!(
    settings &&
    settings.location_configured &&
    settings.latitude != null &&
    settings.longitude != null
  );
}

export interface QrTokenRecord extends QrTokenState {
  id: string;
}

export async function loadQrToken(token: string): Promise<QrTokenRecord | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("attendance_qr_tokens")
    .select("id, revoked_at, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    found: true,
    revoked: data.revoked_at != null,
    expiresAt: data.expires_at,
  };
}

export interface MemberTokenRecord {
  memberId: string;
  memberName: string;
  memberStatus: string;
  membershipStartDate: string | null;
  state: MemberTokenState;
  tokenId: string;
}

/** Resolves a member attendance token (typed code or personal link). */
export async function loadMemberByToken(token: string): Promise<MemberTokenRecord | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("member_attendance_tokens")
    .select(
      "id, token_hash, revoked_at, expires_at, member:members(id, full_name, status, membership_start_date)"
    )
    .eq("token_hash", hashToken(normalizeToken(token)))
    .maybeSingle();
  if (!data) return null;
  // The embedded many-to-one relation arrives as an object; tolerate an
  // array shape as well (untyped client inference).
  const member: { id: string; full_name: string; status: string; membership_start_date: string | null } | null =
    Array.isArray(data.member) ? (data.member[0] ?? null) : (data.member ?? null);
  if (!member) return null;
  return {
    tokenId: data.id,
    memberId: member.id,
    memberName: member.full_name,
    memberStatus: member.status,
    membershipStartDate: member.membership_start_date,
    state: {
      found: true,
      revoked: data.revoked_at != null,
      expiresAt: data.expires_at,
    },
  };
}

export async function hasPresentAttendance(memberId: string, localDate: string) {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("attendance_date", localDate)
    .eq("event_type", "check_in")
    .eq("status", "present");
  return (count ?? 0) > 0;
}

export function gymLocalDate(settings: AttendanceSettings) {
  return localDateIn(settings.timezone);
}

/**
 * Inserts an attendance row. The DB trigger is the race-proof
 * duplicate guard — it raises ATTENDANCE_DUPLICATE, which we map to a
 * friendly result here. The generated confirmation reference is
 * returned so the success screen can display it.
 */
export async function createAttendanceRecord(input: {
  memberId: string;
  attendanceDate: string;
  distanceMeters: number | null;
  gpsAccuracyMeters: number | null;
  confirmationReference: string;
  qrTokenId: string | null;
}): Promise<{
  error?: string;
  duplicate?: boolean;
  checkInAt?: string;
  reference?: string;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance")
    .insert({
      member_id: input.memberId,
      attendance_date: input.attendanceDate,
      distance_meters: input.distanceMeters,
      gps_accuracy_meters: input.gpsAccuracyMeters,
      verification_method: "qr_gps",
      confirmation_reference: input.confirmationReference,
      qr_token_id: input.qrTokenId,
    })
    .select("id, check_in_at, confirmation_reference")
    .single();
  if (error) {
    if (error.message.includes("ATTENDANCE_DUPLICATE")) return { duplicate: true };
    return { error: error.message };
  }
  return {
    checkInAt: data.check_in_at,
    reference: data.confirmation_reference,
  };
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function jsonData(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data: payload }, { status });
}

// Lightweight in-memory rate limiter for the public attendance API.
// Render runs a single Node instance, so this process-local bucket is
// effective; it only needs to blunt abuse, not be perfectly global.
type Bucket = { n: number; t: number };
const buckets: Map<string, Bucket> =
  (globalThis as Record<string, unknown>).__attendanceBuckets instanceof Map
    ? ((globalThis as Record<string, unknown>).__attendanceBuckets as Map<string, Bucket>)
    : new Map();
(globalThis as Record<string, unknown>).__attendanceBuckets = buckets;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.t > windowMs) {
    buckets.set(key, { n: 1, t: now });
    if (buckets.size > 5000) buckets.clear();
    return true;
  }
  b.n += 1;
  return b.n <= limit;
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
