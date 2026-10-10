import { createAdminClient } from "@/lib/supabase-server";
import { groupToken, hashToken, normalizeToken } from "@/lib/attendance/core";
import { SaveDevice } from "./save-device";
import { Dumbbell, Link2Off, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MemberAttendanceLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const [tokenRow, gymRow] = await Promise.all([
    supabase
      .from("member_attendance_tokens")
      .select(
        "revoked_at, expires_at, member:members(full_name)"
      )
      .eq("token_hash", hashToken(normalizeToken(token)))
      .maybeSingle(),
    supabase.from("gym_settings").select("gym_name, logo_url").eq("id", 1).maybeSingle(),
  ]);

  const gymName = gymRow.data?.gym_name ?? "your gym";
  const logoUrl = gymRow.data?.logo_url ?? null;

  const row = tokenRow.data as
    | { revoked_at: string | null; expires_at: string | null; member: { full_name: string } | null }
    | null;
  const valid =
    !!row &&
    !row.revoked_at &&
    (row.expires_at == null || new Date(row.expires_at) > new Date()) &&
    !!row.member;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${gymName} logo`}
              className="mb-3 h-14 w-14 rounded-2xl border border-slate-200 bg-white object-cover"
            />
          ) : (
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Dumbbell className="h-7 w-7" />
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-800">{gymName}</h1>
          <p className="text-sm text-slate-500">Personal Attendance Link</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {!valid ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                <Link2Off className="h-7 w-7 text-rose-600" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                This attendance link is no longer active.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Ask the front desk at {gymName} for a new attendance link.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {(row!.member!.full_name ?? "")
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {row!.member!.full_name}
                  </p>
                  <p className="text-xs text-slate-500">Your attendance identity</p>
                </div>
              </div>

              <SaveDevice token={token} />

              <ol className="space-y-3">
                {[
                  "Save this link on your phone (one time only).",
                  `At ${gymName}, scan the QR code displayed at the entrance with your camera.`,
                  "Tap Verify Location to mark your attendance.",
                ].map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-slate-600">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="flex gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  Keep this link private — anyone with it can check in as you. Your code is{" "}
                  <span className="font-mono font-medium text-slate-600">
                    {groupToken(normalizeToken(token))}
                  </span>
                  {" "}and can be revoked by the gym at any time.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
