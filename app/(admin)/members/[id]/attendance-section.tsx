"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardCheck,
  Copy,
  KeyRound,
  Link2,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Badge } from "@/components/badge";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState } from "@/components/skeleton";
import { formatDate } from "@/lib/utils";
import { formatInTimezone } from "@/lib/attendance/format";
import type { AttendanceRecord, MemberAttendanceToken } from "@/lib/types";
import {
  regenerateMemberAttendanceToken,
  revokeMemberAttendanceToken,
} from "@/lib/actions/attendance";

export function AttendanceSection({
  memberId,
  token,
  attendance,
  timezone,
}: {
  memberId: string;
  token: MemberAttendanceToken | null;
  attendance: AttendanceRecord[];
  timezone: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; url: string } | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);

  const active = !!token && !token.revoked_at;
  const codeOf = (t: string) => t.match(/.{1,4}/g)?.join("-") ?? t;

  async function regenerate() {
    setBusy(true);
    const res = await regenerateMemberAttendanceToken(memberId);
    setBusy(false);
    if (res.error) return toast.error(res.error);
    setIssued({ token: res.token!, url: res.url! });
    toast.success("New attendance token generated — the old one is dead");
    router.refresh();
  }

  async function revoke() {
    setBusy(true);
    const res = await revokeMemberAttendanceToken(memberId);
    setBusy(false);
    setRevokeOpen(false);
    if (res.error) return toast.error(res.error);
    setIssued(null);
    toast.success("Attendance token revoked");
    router.refresh();
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Attendance identity"
          subtitle="The personal token members use to check in — no OTP or SMS involved"
          action={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-9 text-xs"
                onClick={() => void regenerate()}
                loading={busy}
              >
                <RefreshCw className="h-3.5 w-3.5" /> {active ? "Regenerate" : "Generate"}
              </Button>
              {active && (
                <Button
                  variant="danger"
                  className="h-9 text-xs"
                  onClick={() => setRevokeOpen(true)}
                >
                  Revoke
                </Button>
              )}
            </div>
          }
        />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                active
                  ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              {active ? "Token active" : token ? "Token revoked" : "No token yet"}
            </span>
            {token && (
              <span className="text-xs text-slate-400">
                {token.revoked_at
                  ? `Revoked ${formatDate(token.revoked_at)}`
                  : `Created ${formatDate(token.created_at)}`}
              </span>
            )}
          </div>

          {issued && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-2 text-sm font-semibold text-emerald-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Shown once — store it safely. It cannot be viewed again after you leave.</p>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                  <span className="truncate font-mono text-sm text-slate-700">
                    {codeOf(issued.token)}
                  </span>
                  <button
                    onClick={() => void copy(issued.token, "Code")}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                    aria-label="Copy attendance code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                  <span className="truncate text-xs text-slate-600">{issued.url}</span>
                  <button
                    onClick={() => void copy(issued.url, "Link")}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                    aria-label="Copy personal link"
                  >
                    <Link2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs text-emerald-700">
                Share the link privately (WhatsApp DM / card). The member saves it once on their
                phone, then scans the gym QR to check in. The code can also be typed at check-in.
              </p>
            </div>
          )}

          {!issued && (
            <div className="flex gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p>
                {active
                  ? "The token is stored only as a hash — generate a new one to recover/share it again."
                  : "Generate a token to let this member check in via QR + GPS. Only a hash is stored; the code is revealed exactly once."}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Attendance history"
          subtitle={`Last ${attendance.length} check-in${attendance.length === 1 ? "" : "s"}`}
        />
        {attendance.length === 0 ? (
          <EmptyState
            title="No attendance yet"
            message="This member has not checked in. They can scan the gym QR code to get started."
          />
        ) : (
          <div className="divide-y divide-slate-50">
            {attendance.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    {formatDate(r.attendance_date)} ·{" "}
                    {formatInTimezone(r.check_in_at, timezone, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      {r.verification_method === "manual" ? (
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5" />
                      )}
                      {r.verification_method === "manual"
                        ? "Manual"
                        : `QR + GPS${r.distance_meters != null ? ` · ${Math.round(Number(r.distance_meters))} m` : ""}`}
                    </span>
                    <span className="font-mono">{r.confirmation_reference}</span>
                    {r.status === "present" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    )}
                  </div>
                  {r.correction_reason && (
                    <div className="mt-0.5 text-xs text-rose-500">
                      Voided: {r.correction_reason}
                    </div>
                  )}
                </div>
                <Badge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={revokeOpen}
        title="Revoke attendance token?"
        message="This member will no longer be able to check in until a new token is generated for them."
        confirmLabel="Revoke"
        danger
        loading={busy}
        onConfirm={() => void revoke()}
        onCancel={() => setRevokeOpen(false)}
      />
    </div>
  );
}
