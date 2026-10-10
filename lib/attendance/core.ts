import { createHash, randomBytes } from "node:crypto";

export { formatInTimezone, isValidTimeZone, localDateIn } from "./format";
import { localDateIn } from "./format";

// ------------------------------------------------------------
// Error codes shared by server responses and member-facing UI.
// Client-only codes (permission/network) never come from the server.
// ------------------------------------------------------------
export type AttendanceErrorCode =
  | "QR_MISSING"
  | "QR_INVALID"
  | "QR_EXPIRED"
  | "MEMBER_TOKEN_REQUIRED"
  | "MEMBER_TOKEN_INVALID"
  | "GYM_NOT_CONFIGURED"
  | "INVALID_COORDINATES"
  | "GPS_ACCURACY_INSUFFICIENT"
  | "OUTSIDE_RADIUS"
  | "MEMBER_INELIGIBLE"
  | "ALREADY_CHECKED_IN"
  | "PERMISSION_DENIED"
  | "LOCATION_UNAVAILABLE"
  | "NETWORK"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

export type AttendanceDecision =
  | { ok: true; distanceMeters: number }
  | {
      ok: false;
      code: AttendanceErrorCode;
      info?: Record<string, number>;
    };

// ------------------------------------------------------------
// Tokens: cryptographically random, only hashes are persisted.
// Crockford base32 (no I/L/O/U) so codes are easy to read & type.
// ------------------------------------------------------------
const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += BASE32[bytes[i] % BASE32.length];
  }
  return out;
}

/** Member attendance token:16 chars (~80 bits of entropy). */
export function generateMemberToken(): string {
  return randomBase32(16);
}

/** Normalizes user-typed codes: strips separators, fixes look-alikes. */
export function normalizeToken(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Display grouping: ABCD-EFGH-JKLM-NPQR */
export function groupToken(token: string): string {
  return token.match(/.{1,4}/g)?.join("-") ?? token;
}

export function generateConfirmationReference(): string {
  return "FG-" + randomBase32(10);
}

// ------------------------------------------------------------
// Geospatial: Haversine distance, server-authoritative.
// ------------------------------------------------------------
const EARTH_RADIUS_M = 6371000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ------------------------------------------------------------
// Settings / eligibility shapes (structurally typed for easy tests)
// ------------------------------------------------------------
export interface AttendanceSettingsLike {
  gym_name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  max_gps_accuracy_meters: number;
  timezone: string;
  qr_validity_seconds: number;
  qr_mode: "rotating" | "permanent";
  duplicate_policy: "daily" | "multiple";
  location_configured: boolean;
}

export interface GpsInput {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface QrTokenState {
  found: boolean;
  revoked: boolean;
  expiresAt: string | Date;
}

export interface MemberTokenState {
  found: boolean;
  revoked: boolean;
  expiresAt: string | Date | null;
}

export interface MemberState {
  status: string;
  membership_start_date: string | null;
}

const ELIGIBLE_STATUSES = new Set(["active", "expiring_soon"]);

export function isCoordinateValid(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function isMemberEligible(member: MemberState, localToday: string): boolean {
  if (!ELIGIBLE_STATUSES.has(member.status)) return false;
  if (member.membership_start_date && member.membership_start_date > localToday) return false;
  return true;
}

// ------------------------------------------------------------
// Full server-side decision. Never trusts anything the browser says
// about distance, identity or time — only raw GPS input is taken from
// the client; every check below runs on the server with trusted data.
// ------------------------------------------------------------
export interface CheckInInput {
  settings: AttendanceSettingsLike | null;
  qr: QrTokenState | null;
  memberToken: MemberTokenState | null;
  member: MemberState | null;
  gps: GpsInput | null;
  alreadyCheckedIn: boolean;
  now?: Date;
}

export function evaluateCheckIn(input: CheckInInput): AttendanceDecision {
  const now = input.now ?? new Date();
  const { settings } = input;

  //1. Trusted gym configuration must exist and be reviewed/saved.
  if (
    !settings ||
    !settings.location_configured ||
    settings.latitude == null ||
    settings.longitude == null
  ) {
    return { ok: false, code: "GYM_NOT_CONFIGURED" };
  }

  //2. QR authenticity / revocation / expiration (server clock).
  if (!input.qr || !input.qr.found || input.qr.revoked) {
    return { ok: false, code: "QR_INVALID" };
  }
  if (new Date(input.qr.expiresAt) <= now) {
    return { ok: false, code: "QR_EXPIRED" };
  }

  //3. Member identity token must be valid and active.
  if (!input.memberToken || !input.memberToken.found || input.memberToken.revoked) {
    return { ok: false, code: "MEMBER_TOKEN_INVALID" };
  }
  if (
    input.memberToken.expiresAt != null &&
    new Date(input.memberToken.expiresAt) <= now
  ) {
    return { ok: false, code: "MEMBER_TOKEN_INVALID" };
  }

  //4. Membership eligibility (status maintained by existing trigger).
  if (!input.member || !isMemberEligible(input.member, localDateIn(settings.timezone, now))) {
    return { ok: false, code: "MEMBER_INELIGIBLE" };
  }

  //5. GPS payload must be present and well-formed.
  const gps = input.gps;
  if (
    !gps ||
    !isCoordinateValid(gps.latitude, gps.longitude) ||
    !Number.isFinite(gps.accuracy) ||
    gps.accuracy <= 0
  ) {
    return { ok: false, code: "INVALID_COORDINATES" };
  }

  //6. Reported accuracy must meet the configured limit.
  if (gps.accuracy > settings.max_gps_accuracy_meters) {
    return {
      ok: false,
      code: "GPS_ACCURACY_INSUFFICIENT",
      info: { accuracy: Math.round(gps.accuracy), max: settings.max_gps_accuracy_meters },
    };
  }

  //7. Server-side distance calculation (Haversine).
  const distance = haversineMeters(
    gps.latitude,
    gps.longitude,
    settings.latitude,
    settings.longitude
  );
  if (distance > settings.allowed_radius_meters) {
    return {
      ok: false,
      code: "OUTSIDE_RADIUS",
      info: { distance: Math.round(distance), radius: settings.allowed_radius_meters },
    };
  }

  //8. Duplicate-prevention policy (friendly pre-check; the DB trigger
  //    is the race-proof authority and raises ATTENDANCE_DUPLICATE).
  if (settings.duplicate_policy === "daily" && input.alreadyCheckedIn) {
    return { ok: false, code: "ALREADY_CHECKED_IN" };
  }

  return { ok: true, distanceMeters: Math.round(distance * 100) / 100 };
}
