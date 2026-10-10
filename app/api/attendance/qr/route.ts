import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase-server";
import { hashToken, randomBase32 } from "@/lib/attendance/core";
import { loadAttendanceSettings } from "@/lib/attendance/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Force a fresh token even in permanent mode (Regenerate button). */
  force: z.boolean().optional(),
});

const PERMANENT_YEARS = 10;

/**
 * POST /api/attendance/qr  (admin session required)
 * Issues gym QR tokens server-side.
 *  - rotating: a fresh unpredictable nonce valid for the configured
 *    number of seconds (default 60); the client refreshes with a small
 *    overlap so the displayed code never has an unscannable gap.
 *  - permanent: a long-lived nonce (weaker security, opt-in). Previously
 *    issued permanent nonces stay valid until revoked or until the admin
 *    switches modes, so printed QR codes keep working.
 * The response contains only the attendance URL — never any secret.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: { code: "BAD_REQUEST" } }, { status: 400 });
    }

    const settings = await loadAttendanceSettings();
    const mode = settings?.qr_mode ?? "rotating";
    const validity = settings?.qr_validity_seconds ?? 60;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

    const admin = createAdminClient();
    const now = new Date();
    const token = randomBase32(32);
    const expiresAt = new Date(
      now.getTime() + (mode === "permanent" ? PERMANENT_YEARS : validity) * 1000
    );

    const { error } = await admin.from("attendance_qr_tokens").insert({
      token_hash: hashToken(token),
      mode,
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    });
    if (error) {
      console.error("qr token insert error", error.message);
      return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
    }

    // Opportunistic cleanup of long-expired rotating nonces.
    await admin
      .from("attendance_qr_tokens")
      .delete()
      .lt("expires_at", new Date(now.getTime() - 24 * 3600 * 1000).toISOString());

    return NextResponse.json({
      data: {
        url: `${base}/attend?qr=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
        mode,
        validitySeconds: validity,
        issued: true,
      },
    });
  } catch (err) {
    console.error("qr token error", err);
    return NextResponse.json({ error: { code: "SERVER_ERROR" } }, { status: 500 });
  }
}
