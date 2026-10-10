import { describe, expect, it } from "vitest";
import {
  type AttendanceErrorCode,
  type AttendanceSettingsLike,
  evaluateCheckIn,
  generateMemberToken,
  groupToken,
  hashToken,
  haversineMeters,
  isCoordinateValid,
  isMemberEligible,
  isValidTimeZone,
  localDateIn,
  formatInTimezone,
  normalizeToken,
  randomBase32,
} from "./core";
import { ATTENDANCE_MESSAGES, attendanceMessage } from "./messages";

const NOW = new Date("2026-01-05T10:00:00Z"); //15:30 IST, Monday

const GYM_LAT = 12.9716;
const GYM_LNG = 77.5946;

const settings: AttendanceSettingsLike = {
  gym_name: "FitGym",
  latitude: GYM_LAT,
  longitude: GYM_LNG,
  allowed_radius_meters: 50,
  max_gps_accuracy_meters: 50,
  timezone: "Asia/Kolkata",
  qr_validity_seconds: 60,
  qr_mode: "rotating",
  duplicate_policy: "daily",
  location_configured: true,
};

// ~18 m north of the gym (1 degree latitude ≈111194.93 m on Earth)
const DEG_PER_M = 1 / 111194.9266;
const INSIDE = {
  latitude: GYM_LAT + 18 * DEG_PER_M,
  longitude: GYM_LNG,
  accuracy: 15,
};
const FAR = {
  latitude: GYM_LAT + 300 * DEG_PER_M,
  longitude: GYM_LNG,
  accuracy: 15,
};

const base = {
  settings,
  qr: { found: true, revoked: false, expiresAt: new Date(NOW.getTime() + 30_000) },
  memberToken: { found: true, revoked: false, expiresAt: null },
  member: { status: "active", membership_start_date: "2025-01-01" },
  gps: INSIDE,
  alreadyCheckedIn: false,
  now: NOW,
};

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineMeters(12.9716, 77.5946, 12.9716, 77.5946)).toBe(0);
  });

  it("matches one degree of latitude (~111.19 km)", () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("measures the example distances used by the spec (~18 m)", () => {
    const d = haversineMeters(INSIDE.latitude, INSIDE.longitude, GYM_LAT, GYM_LNG);
    expect(Math.round(d)).toBe(18);
  });
});

describe("evaluateCheckIn — acceptance matrix", () => {
  // Spec scenario1: valid member, valid QR, inside the gym
  it("accepts a valid check-in inside the radius", () => {
    const res = evaluateCheckIn(base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.distanceMeters).toBeGreaterThanOrEqual(0);
      expect(res.distanceMeters).toBeLessThanOrEqual(settings.allowed_radius_meters);
    }
  });

  // Spec scenario2: outside the allowed radius
  it("rejects a member300 m away", () => {
    const res = evaluateCheckIn({ ...base, gps: FAR });
    expect(res).toEqual({
      ok: false,
      code: "OUTSIDE_RADIUS",
      info: { distance: expect.any(Number), radius: 50 },
    });
    if (!res.ok) expect(res.info!.distance).toBeGreaterThan(290);
  });

  // Spec scenario3: GPS permission denied (handled client-side, but the
  // member-facing message must give actionable guidance)
  it("has an actionable message for denied location permission", () => {
    expect(ATTENDANCE_MESSAGES.PERMISSION_DENIED).toMatch(/permission denied/i);
    expect(ATTENDANCE_MESSAGES.PERMISSION_DENIED).toMatch(/browser settings/i);
  });

  // Spec scenario4: GPS accuracy below the configured limit
  it("rejects insufficient GPS accuracy", () => {
    const res = evaluateCheckIn({ ...base, gps: { ...INSIDE, accuracy: 60 } });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("GPS_ACCURACY_INSUFFICIENT");
      expect(res.info).toEqual({ accuracy: 60, max: 50 });
    }
  });

  it("accepts accuracy exactly at the configured limit", () => {
    const res = evaluateCheckIn({ ...base, gps: { ...INSIDE, accuracy: 50 } });
    expect(res.ok).toBe(true);
  });

  // Spec scenario5: expired QR token
  it("rejects an expired QR token", () => {
    const res = evaluateCheckIn({
      ...base,
      qr: { found: true, revoked: false, expiresAt: new Date(NOW.getTime() - 1) },
    });
    expect(res).toEqual({ ok: false, code: "QR_EXPIRED" });
  });

  // Spec scenario6: invalid or revoked QR token
  it("rejects a revoked QR token", () => {
    const res = evaluateCheckIn({
      ...base,
      qr: { found: true, revoked: true, expiresAt: new Date(NOW.getTime() + 30_000) },
    });
    expect(res).toEqual({ ok: false, code: "QR_INVALID" });
  });

  it("rejects an unknown QR token", () => {
    expect(evaluateCheckIn({ ...base, qr: null })).toEqual({ ok: false, code: "QR_INVALID" });
    expect(
      evaluateCheckIn({ ...base, qr: { found: false, revoked: false, expiresAt: NOW } })
    ).toEqual({ ok: false, code: "QR_INVALID" });
  });

  // Spec scenario7: invalid or revoked member token
  it("rejects a revoked member token", () => {
    const res = evaluateCheckIn({
      ...base,
      memberToken: { found: true, revoked: true, expiresAt: null },
    });
    expect(res).toEqual({ ok: false, code: "MEMBER_TOKEN_INVALID" });
  });

  it("rejects an expired member token", () => {
    const res = evaluateCheckIn({
      ...base,
      memberToken: { found: true, revoked: false, expiresAt: new Date(NOW.getTime() - 1) },
    });
    expect(res).toEqual({ ok: false, code: "MEMBER_TOKEN_INVALID" });
  });

  it("rejects a missing member token", () => {
    expect(evaluateCheckIn({ ...base, memberToken: null })).toEqual({
      ok: false,
      code: "MEMBER_TOKEN_INVALID",
    });
  });

  // Spec scenario8: ineligible member
  it("rejects expired, inactive and not-yet-started memberships", () => {
    expect(
      evaluateCheckIn({ ...base, member: { status: "expired", membership_start_date: null } })
    ).toEqual({ ok: false, code: "MEMBER_INELIGIBLE" });
    expect(
      evaluateCheckIn({ ...base, member: { status: "inactive", membership_start_date: null } })
    ).toEqual({ ok: false, code: "MEMBER_INELIGIBLE" });
    expect(
      evaluateCheckIn({ ...base, member: { status: "active", membership_start_date: "2026-01-06" } })
    ).toEqual({ ok: false, code: "MEMBER_INELIGIBLE" });
  });

  it("accepts expiring-soon memberships (still valid)", () => {
    const res = evaluateCheckIn({
      ...base,
      member: { status: "expiring_soon", membership_start_date: "2025-01-01" },
    });
    expect(res.ok).toBe(true);
  });

  // Spec scenario9: double scan on the same day
  it("blocks a second check-in the same local day (daily policy)", () => {
    const res = evaluateCheckIn({ ...base, alreadyCheckedIn: true });
    expect(res).toEqual({ ok: false, code: "ALREADY_CHECKED_IN" });
    expect(ATTENDANCE_MESSAGES.ALREADY_CHECKED_IN).toBe(
      "Your attendance has already been recorded today."
    );
  });

  it("allows re-check-ins under the 'multiple' policy", () => {
    const res = evaluateCheckIn({
      ...base,
      alreadyCheckedIn: true,
      settings: { ...settings, duplicate_policy: "multiple" },
    });
    expect(res.ok).toBe(true);
  });

  // Spec scenario10 (concurrent duplicates) is guarded by the DB trigger
  // (supabase/attendance.sql) — see supabase/attendance_verify.sql.

  // Spec scenarios11–12 (auth/RLS) — see supabase/attendance_verify.sql.

  // Spec scenario13: admin changes gym coordinates
  it("refuses check-ins until the location is configured and reviewed", () => {
    expect(
      evaluateCheckIn({ ...base, settings: { ...settings, location_configured: false } })
    ).toEqual({ ok: false, code: "GYM_NOT_CONFIGURED" });
    expect(
      evaluateCheckIn({
        ...base,
        settings: { ...settings, latitude: null, longitude: null },
      })
    ).toEqual({ ok: false, code: "GYM_NOT_CONFIGURED" });
    expect(evaluateCheckIn({ ...base, settings: null })).toEqual({
      ok: false,
      code: "GYM_NOT_CONFIGURED",
    });
  });

  it("uses the new coordinates immediately after they are saved", () => {
    const moved = { ...settings, latitude: GYM_LAT + 0.01 };
    expect(evaluateCheckIn({ ...base, settings: moved, gps: INSIDE })).toEqual({
      ok: false,
      code: "OUTSIDE_RADIUS",
      info: { distance: expect.any(Number), radius: 50 },
    });
  });

  // Spec scenario14 (network failure) — client-side messaging
  it("has a member-facing network failure message", () => {
    expect(ATTENDANCE_MESSAGES.NETWORK).toMatch(/try again/i);
  });

  // Malformed / spoofed coordinates
  it("rejects out-of-range or non-finite coordinates", () => {
    expect(evaluateCheckIn({ ...base, gps: { ...INSIDE, latitude: 91 } })).toEqual({
      ok: false,
      code: "INVALID_COORDINATES",
    });
    expect(evaluateCheckIn({ ...base, gps: { ...INSIDE, longitude: -181 } })).toEqual({
      ok: false,
      code: "INVALID_COORDINATES",
    });
    expect(evaluateCheckIn({ ...base, gps: { ...INSIDE, accuracy: 0 } })).toEqual({
      ok: false,
      code: "INVALID_COORDINATES",
    });
    expect(evaluateCheckIn({ ...base, gps: null })).toEqual({
      ok: false,
      code: "INVALID_COORDINATES",
    });
  });
});

describe("coordinate + eligibility helpers", () => {
  it("validates coordinate ranges", () => {
    expect(isCoordinateValid(0, 0)).toBe(true);
    expect(isCoordinateValid(-90, 180)).toBe(true);
    expect(isCoordinateValid(90.1, 0)).toBe(false);
    expect(isCoordinateValid(Number.NaN, 0)).toBe(false);
  });

  it("checks membership eligibility against the local date", () => {
    expect(isMemberEligible({ status: "active", membership_start_date: null }, "2026-01-05")).toBe(
      true
    );
    expect(isMemberEligible({ status: "expired", membership_start_date: null }, "2026-01-05")).toBe(
      false
    );
    expect(
      isMemberEligible({ status: "active", membership_start_date: "2026-01-05" }, "2026-01-05")
    ).toBe(true);
    expect(
      isMemberEligible({ status: "active", membership_start_date: "2026-01-06" }, "2026-01-05")
    ).toBe(false);
  });
});

describe("tokens", () => {
  it("generates random codes from a safe alphabet", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateMemberToken()));
    expect(codes.size).toBe(200); // no collisions in200 draws
    for (const c of codes) {
      expect(c).toHaveLength(16);
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    }
  });

  it("normalizes typed codes (case, separators, look-alikes)", () => {
    // I, L →1 and O →0 because generated tokens never contain I/L/O/U;
    // a typed L is a misread of the digit1.
    expect(normalizeToken("abcd-efgh jklm")).toBe("ABCDEFGHJK1M");
    expect(normalizeToken("aBcD")).toBe("ABCD");
    expect(normalizeToken("IL0O")).toBe("1100"); // I,L→1 · O→0
    expect(normalizeToken("ABCD-EFGH-JKMN-PQRS")).toBe("ABCDEFGHJKMNPQRS");
    expect(hashToken(normalizeToken("abcd-efgh jklm"))).toBe(hashToken("ABCDEFGHJK1M"));
  });

  it("hashes deterministically as sha-256 hex", () => {
    const h = hashToken("ABCDEFGH");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("ABCDEFGH")).toBe(h);
    expect(hashToken("ABCDEFGI")).not.toBe(h);
    expect(hashToken(normalizeToken("abcd-efgh"))).toBe(h);
  });

  it("groups codes for display", () => {
    expect(groupToken("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
  });

  it("randomBase32 never emits ambiguous characters", () => {
    const s = randomBase32(500);
    expect(s).toHaveLength(500);
    expect(s).not.toMatch(/[ILOU]/);
  });
});

describe("timezones", () => {
  it("computes the gym-local calendar date", () => {
    //18:30 UTC =00:30 IST the next day
    expect(localDateIn("Asia/Kolkata", new Date("2026-01-01T18:30:00Z"))).toBe("2026-01-02");
    expect(localDateIn("Asia/Kolkata", new Date("2026-01-01T18:29:00Z"))).toBe("2026-01-01");
    expect(localDateIn("UTC", new Date("2026-01-01T23:59:00Z"))).toBe("2026-01-01");
  });

  it("validates IANA timezone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("formats instants in the gym timezone", () => {
    expect(
      formatInTimezone("2026-01-05T10:00:00Z", "Asia/Kolkata", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    ).toBe("15:30");
    expect(
      formatInTimezone("2026-01-05T10:00:00Z", "UTC", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    ).toBe("10:00");
  });
});

describe("member-facing messages", () => {
  const codes: AttendanceErrorCode[] = [
    "QR_MISSING",
    "QR_INVALID",
    "QR_EXPIRED",
    "MEMBER_TOKEN_REQUIRED",
    "MEMBER_TOKEN_INVALID",
    "GYM_NOT_CONFIGURED",
    "INVALID_COORDINATES",
    "GPS_ACCURACY_INSUFFICIENT",
    "OUTSIDE_RADIUS",
    "MEMBER_INELIGIBLE",
    "ALREADY_CHECKED_IN",
    "PERMISSION_DENIED",
    "LOCATION_UNAVAILABLE",
    "NETWORK",
    "RATE_LIMITED",
    "SERVER_ERROR",
  ];

  it("covers every error code with a safe, actionable message", () => {
    for (const code of codes) {
      const msg = attendanceMessage(code);
      expect(msg.length, `message for ${code}`).toBeGreaterThan(10);
      // Never leak internals
      expect(msg.toLowerCase()).not.toContain("supabase");
      expect(msg.toLowerCase()).not.toContain("sql");
      expect(msg.toLowerCase()).not.toContain("stack");
    }
  });

  it("falls back to a generic server-error message for unknown codes", () => {
    expect(attendanceMessage("WEIRD_NEW_CODE")).toBe(ATTENDANCE_MESSAGES.SERVER_ERROR);
    expect(attendanceMessage(null)).toBe(ATTENDANCE_MESSAGES.SERVER_ERROR);
  });
});
