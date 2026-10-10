import { NextRequest } from "next/server";
import { z } from "zod";
import {
  evaluateCheckIn,
  generateConfirmationReference,
  localDateIn,
} from "@/lib/attendance/core";
import { ATTENDANCE_MESSAGES } from "@/lib/attendance/messages";
import {
  clientIp,
  createAttendanceRecord,
  hasPresentAttendance,
  isLocationConfigured,
  jsonData,
  jsonError,
  loadAttendanceSettings,
  loadMemberByToken,
  loadQrToken,
  rateLimit,
} from "@/lib/attendance/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  qrToken: z.string().min(8).max(400),
  memberToken: z.string().min(4).max(80),
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().positive().max(1_000_000),
  clientTimestamp: z.string().max(64).optional(),
});

/** HTTP status for each refusal code. */
const STATUS: Record<string, number> = {
  GYM_NOT_CONFIGURED: 503,
  QR_INVALID: 403,
  QR_EXPIRED: 403,
  MEMBER_TOKEN_INVALID: 403,
  MEMBER_INELIGIBLE: 403,
  INVALID_COORDINATES: 400,
  GPS_ACCURACY_INSUFFICIENT: 422,
  OUTSIDE_RADIUS: 403,
  ALREADY_CHECKED_IN: 409,
};

/**
 * POST /api/attendance/mark
 * The single trusted endpoint that records attendance. The browser only
 * supplies raw GPS + opaque tokens: identity, membership, QR validity,
 * distance (Haversine) and the duplicate policy are all decided here
 * with trusted server data, and the insert is guarded by a DB trigger
 * so concurrent duplicates cannot slip through.
 */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`mark:${clientIp(req.headers)}`, 15, 60_000)) {
      return jsonError(429, "RATE_LIMITED", ATTENDANCE_MESSAGES.RATE_LIMITED);
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(400, "BAD_REQUEST", "Invalid request.");
    }
    const { qrToken, memberToken, latitude, longitude, accuracy, clientTimestamp } =
      parsed.data;

    // Diagnostics only — never trusted, never persisted raw.
    if (clientTimestamp && Number.isNaN(Date.parse(clientTimestamp))) {
      return jsonError(400, "BAD_REQUEST", "Invalid request.");
    }

    const settings = await loadAttendanceSettings();
    if (!(await isLocationConfigured(settings))) {
      return jsonError(503, "GYM_NOT_CONFIGURED", ATTENDANCE_MESSAGES.GYM_NOT_CONFIGURED);
    }

    const qr = await loadQrToken(qrToken);
    const record = await loadMemberByToken(memberToken);
    const today = localDateIn(settings!.timezone);
    const alreadyCheckedIn = record
      ? await hasPresentAttendance(record.memberId, today)
      : false;

    const decision = evaluateCheckIn({
      settings: settings!,
      qr,
      memberToken: record ? record.state : { found: false, revoked: false, expiresAt: null },
      member: record
        ? {
            status: record.memberStatus,
            membership_start_date: record.membershipStartDate,
          }
        : null,
      gps: { latitude, longitude, accuracy },
      alreadyCheckedIn,
    });

    if (!decision.ok) {
      const status = STATUS[decision.code] ?? 403;
      let message = ATTENDANCE_MESSAGES[decision.code] ?? ATTENDANCE_MESSAGES.SERVER_ERROR;
      if (decision.code === "OUTSIDE_RADIUS" && decision.info) {
        message = `You appear to be outside the gym's allowed area (${decision.info.distance} m away; allowed ${decision.info.radius} m). Please check in from inside the gym.`;
      } else if (decision.code === "GPS_ACCURACY_INSUFFICIENT" && decision.info) {
        message = `Your GPS accuracy is ±${decision.info.accuracy} m — too low for a reliable check-in (limit ±${decision.info.max} m). Move near a window or outdoors and try again.`;
      }
      return jsonError(status, decision.code, message);
    }

    const reference = generateConfirmationReference();
    const inserted = await createAttendanceRecord({
      memberId: record!.memberId,
      attendanceDate: today,
      distanceMeters: decision.distanceMeters,
      gpsAccuracyMeters: Math.round(accuracy * 100) / 100,
      confirmationReference: reference,
      qrTokenId: qr!.id,
    });

    if (inserted.duplicate) {
      return jsonError(409, "ALREADY_CHECKED_IN", ATTENDANCE_MESSAGES.ALREADY_CHECKED_IN);
    }
    if (inserted.error) {
      console.error("attendance insert error", inserted.error);
      return jsonError(500, "SERVER_ERROR", ATTENDANCE_MESSAGES.SERVER_ERROR);
    }

    const checkInAt = inserted.checkInAt ?? new Date().toISOString();
    return jsonData({
      reference: inserted.reference ?? reference,
      memberName: record!.memberName,
      gymName: settings!.gym_name,
      checkInAt,
      attendanceDate: today,
      distanceMeters: decision.distanceMeters,
    });
  } catch (err) {
    console.error("mark attendance error", err);
    return jsonError(500, "SERVER_ERROR", ATTENDANCE_MESSAGES.SERVER_ERROR);
  }
}
