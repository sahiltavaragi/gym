import { NextRequest } from "next/server";
import { z } from "zod";
import {
  isMemberEligible,
  localDateIn,
} from "@/lib/attendance/core";
import { ATTENDANCE_MESSAGES } from "@/lib/attendance/messages";
import {
  clientIp,
  hasPresentAttendance,
  isLocationConfigured,
  jsonData,
  jsonError,
  loadAttendanceSettings,
  loadMemberByToken,
  loadQrToken,
  rateLimit,
} from "@/lib/attendance/server";
import { createAdminClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const bodySchema = z.object({
  qrToken: z.string().min(8).max(400),
  memberToken: z.string().min(4).max(80).optional(),
});

/**
 * POST /api/attendance/context
 * Validates the scanned QR token (and, when supplied, the member's
 * attendance token) and returns just enough display data for the
 * member-identity confirmation step. Never exposes other members,
 * tokens, or internals.
 */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`ctx:${clientIp(req.headers)}`, 30, 60_000)) {
      return jsonError(429, "RATE_LIMITED", ATTENDANCE_MESSAGES.RATE_LIMITED);
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "BAD_REQUEST", "Invalid request.");
    }
    const { qrToken, memberToken } = parsed.data;

    const settings = await loadAttendanceSettings();
    if (!(await isLocationConfigured(settings))) {
      return jsonError(503, "GYM_NOT_CONFIGURED", ATTENDANCE_MESSAGES.GYM_NOT_CONFIGURED);
    }

    const qr = await loadQrToken(qrToken);
    if (!qr || !qr.found || qr.revoked) {
      return jsonError(403, "QR_INVALID", ATTENDANCE_MESSAGES.QR_INVALID);
    }
    if (new Date(qr.expiresAt) <= new Date()) {
      return jsonError(403, "QR_EXPIRED", ATTENDANCE_MESSAGES.QR_EXPIRED);
    }

    const { data: gymSettings } = await createAdminClient()
      .from("gym_settings")
      .select("gym_name, logo_url")
      .eq("id", 1)
      .maybeSingle();

    const gym = {
      name: settings!.gym_name,
      logoUrl: gymSettings?.logo_url ?? null,
      timezone: settings!.timezone,
      allowedRadiusMeters: settings!.allowed_radius_meters,
      duplicatePolicy: settings!.duplicate_policy,
    };

    if (!memberToken) {
      // No identity yet: confirm the scan, ask for the member's code.
      return jsonData({ gym, member: null, needsIdentity: true });
    }

    const record = await loadMemberByToken(memberToken);
    if (!record || !record.state.found || record.state.revoked) {
      return jsonError(403, "MEMBER_TOKEN_INVALID", ATTENDANCE_MESSAGES.MEMBER_TOKEN_INVALID);
    }
    if (
      record.state.expiresAt != null &&
      new Date(record.state.expiresAt) <= new Date()
    ) {
      return jsonError(403, "MEMBER_TOKEN_INVALID", ATTENDANCE_MESSAGES.MEMBER_TOKEN_INVALID);
    }

    const today = localDateIn(settings!.timezone);
    const eligible = isMemberEligible(
      { status: record.memberStatus, membership_start_date: record.membershipStartDate },
      today
    );
    const alreadyCheckedIn = await hasPresentAttendance(record.memberId, today);

    return jsonData({
      gym,
      needsIdentity: false,
      member: {
        name: record.memberName,
        eligible,
        alreadyCheckedIn,
      },
    });
  } catch (err) {
    console.error("attendance context error", err);
    return jsonError(500, "SERVER_ERROR", ATTENDANCE_MESSAGES.SERVER_ERROR);
  }
}
