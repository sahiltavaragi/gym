"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  History,
  MapPin,
  Plus,
  QrCode,
  Search,
  Settings,
  UserMinus,
  Users,
} from "lucide-react";
import { Card } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field, Textarea } from "@/components/input";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/badge";
import { EmptyState, Skeleton } from "@/components/skeleton";
import { formatDate } from "@/lib/utils";
import { formatInTimezone, localDateIn } from "@/lib/attendance/format";
import type { AttendanceRecord, AttendanceSettings } from "@/lib/types";
import {
  getAttendanceForExport,
  getAttendanceStats,
  getMemberAttendanceHistory,
  listAttendance,
  recordManualAttendance,
  voidAttendance,
} from "@/lib/actions/attendance";

type Stats = {
  todayCount: number;
  activeMembers: number;
  notCheckedIn: number;
  monthCount: number;
  localDate: string;
  timezone: string;
};

const PAGE_SIZE = 15;

export function AttendanceClient({
  settings,
  members,
}: {
  settings: AttendanceSettings | null;
  members: { id: string; full_name: string; status: string }[];
}) {
  const tz = settings?.timezone ?? "Asia/Kolkata";

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<AttendanceRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [memberId, setMemberId] = useState("");

  // Manual check-in modal
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMember, setManualMember] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualReason, setManualReason] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  // Correction (void) modal
  const [voidTarget, setVoidTarget] = useState<AttendanceRecord | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidSaving, setVoidSaving] = useState(false);

  // Member history modal
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fmtTime = (iso: string) =>
    formatInTimezone(iso, tz, { hour: "2-digit", minute: "2-digit" });

  const fetchList = useCallback(async () => {
    setLoading(true);
    const res = await listAttendance({ page, pageSize: PAGE_SIZE, search, date, memberId });
    setLoading(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setRows(res.data);
    setCount(res.count);
  }, [page, search, date, memberId]);

  const fetchStats = useCallback(async () => {
    const res = await getAttendanceStats();
    if ("error" in res) return;
    setStats(res.data);
  }, []);

  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
      setLoading(true);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // Data loading effects: async IIFE with the await first, so nothing
  // runs synchronously in the effect body (no cascading renders).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listAttendance({
        page,
        pageSize: PAGE_SIZE,
        search,
        date,
        memberId,
      });
      if (cancelled) return;
      setLoading(false);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setRows(res.data);
      setCount(res.count);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, search, date, memberId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getAttendanceStats();
      if (cancelled || "error" in res) return;
      setStats(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(() => {
    void fetchList();
    void fetchStats();
  }, [fetchList, fetchStats]);

  function openManual() {
    setManualMember(memberId || "");
    setManualDate(localDateIn(tz));
    setManualReason("");
    setManualOpen(true);
  }

  async function saveManual() {
    if (!manualMember) return toast.error("Select a member");
    setManualSaving(true);
    const res = await recordManualAttendance({
      memberId: manualMember,
      date: manualDate || undefined,
      reason: manualReason || undefined,
    });
    setManualSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success(`Attendance recorded — ref ${res.data!.confirmation_reference}`);
    setManualOpen(false);
    reload();
  }

  async function saveVoid() {
    if (!voidTarget) return;
    setVoidSaving(true);
    const res = await voidAttendance(voidTarget.id, voidReason);
    setVoidSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success("Attendance record voided (audit log updated)");
    setVoidTarget(null);
    setVoidReason("");
    reload();
  }

  async function openHistory(member: { id: string; name: string }) {
    setHistoryFor(member);
    setHistoryRows([]);
    setHistoryLoading(true);
    const res = await getMemberAttendanceHistory(member.id);
    setHistoryLoading(false);
    if ("error" in res) return toast.error(res.error);
    setHistoryRows(res.data);
  }

  async function exportCsv() {
    setExporting(true);
    const res = await getAttendanceForExport({ search, date, memberId });
    setExporting(false);
    if ("error" in res) return toast.error(res.error);
    if (res.data.length === 0) return toast.error("Nothing to export for these filters");

    const header = [
      "Member",
      "Phone",
      "Date",
      "Time",
      "Status",
      "Verification",
      "Distance (m)",
      "GPS Accuracy (m)",
      "Confirmation Ref",
      "Correction Reason",
    ];
    const body = res.data.map((r) => [
      r.member?.full_name ?? "",
      r.member?.phone_number ?? "",
      r.attendance_date,
      fmtTime(r.check_in_at),
      r.status,
      r.verification_method === "manual" ? "Manual" : "QR + GPS",
      r.distance_meters ?? "",
      r.gps_accuracy_meters ?? "",
      r.confirmation_reference,
      r.correction_reason ?? "",
    ]);
    const csv = [header, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV downloaded");
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const hasFilters = !!(search || date || memberId);

  const cards = [
    {
      label: "Today's Attendance",
      value: stats?.todayCount ?? "—",
      icon: CheckCircle2,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Active Members",
      value: stats?.activeMembers ?? "—",
      icon: Users,
      tone: "bg-sky-50 text-sky-600",
    },
    {
      label: "Not Yet Checked In",
      value: stats?.notCheckedIn ?? "—",
      icon: UserMinus,
      tone: "bg-amber-50 text-amber-600",
    },
    {
      label: "Check-ins This Month",
      value: stats?.monthCount ?? "—",
      icon: CalendarDays,
      tone: "bg-violet-50 text-violet-600",
    },
  ];

  const verification = (r: AttendanceRecord) => {
    if (r.verification_method === "manual") {
      return (
        <span className="inline-flex items-center gap-1.5 text-slate-600">
          <ClipboardCheck className="h-3.5 w-3.5 text-slate-400" /> Manual
        </span>
      );
    }
    const dist =
      r.distance_meters != null ? `${Math.round(Number(r.distance_meters))} m` : "—";
    const acc =
      r.gps_accuracy_meters != null ? ` · ±${Math.round(Number(r.gps_accuracy_meters))} m` : "";
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-600">
        <MapPin className="h-3.5 w-3.5 text-slate-400" /> QR+GPS · {dist}
        {acc}
      </span>
    );
  };

  const rowActions = (r: AttendanceRecord) => (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={() =>
          r.member && openHistory({ id: r.member.id, name: r.member.full_name })
        }
        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Member attendance history"
        aria-label="Member attendance history"
      >
        <History className="h-4 w-4" />
      </button>
      {r.status === "present" && (
        <button
          onClick={() => {
            setVoidTarget(r);
            setVoidReason("");
          }}
          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          title="Void with reason"
          aria-label="Void attendance record"
        >
          <Ban className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Attendance</h1>
          <p className="text-sm text-slate-500">
            QR + GPS check-ins, manual records and corrections
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings/attendance"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
          <Link
            href="/attendance/qr"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <QrCode className="h-3.5 w-3.5" /> QR Display
          </Link>
          <Button onClick={openManual} className="h-9 text-xs">
            <Plus className="h-4 w-4" /> Manual check-in
          </Button>
        </div>
      </div>

      {settings && !settings.location_configured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Gym location is not configured yet — QR check-ins will be rejected.{" "}
          <Link href="/settings/attendance" className="font-semibold underline">
            Set gym location
          </Link>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${c.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-slate-800">{c.value}</div>
                  <div className="truncate text-xs text-slate-500">{c.label}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name or phone…"
                className="pl-9"
                aria-label="Search by member name or phone"
              />
            </div>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              aria-label="Filter by date"
            />
            <Select
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              aria-label="Filter by member"
            >
              <option value="">All members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                  {m.status === "expired" || m.status === "inactive"
                    ? ` (${m.status.replace("_", " ")})`
                    : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {loading ? "Loading…" : `${count} record${count === 1 ? "" : "s"}${hasFilters ? " (filtered)" : ""}`}
            </span>
            <button
              onClick={() => void exportCsv()}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Time</th>
                <th className="px-3 py-3 font-medium">Verification</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id} className={loading ? "opacity-60" : ""}>
                  <td className="px-5 py-3">
                    <button
                      onClick={() =>
                        r.member && openHistory({ id: r.member.id, name: r.member.full_name })
                      }
                      className="text-left text-sm font-medium text-slate-800 hover:underline"
                    >
                      {r.member?.full_name ?? "—"}
                    </button>
                    <div className="text-xs text-slate-400">{r.member?.phone_number ?? ""}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">{formatDate(r.attendance_date)}</td>
                  <td className="px-3 py-3 text-slate-600">{fmtTime(r.check_in_at)}</td>
                  <td className="px-3 py-3 text-xs">{verification(r)}</td>
                  <td className="px-3 py-3">
                    <Badge status={r.status} />
                    {r.correction_reason && (
                      <div className="mt-1 max-w-[160px] truncate text-xs text-slate-400" title={r.correction_reason}>
                        {r.correction_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">{rowActions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 p-3 md:hidden">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-xl border border-slate-100 bg-white p-3.5 ${loading ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    onClick={() =>
                      r.member && openHistory({ id: r.member.id, name: r.member.full_name })
                    }
                    className="block truncate text-sm font-semibold text-slate-800 hover:underline"
                  >
                    {r.member?.full_name ?? "—"}
                  </button>
                  <div className="text-xs text-slate-400">{r.member?.phone_number ?? ""}</div>
                </div>
                <Badge status={r.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  {formatDate(r.attendance_date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                  {fmtTime(r.check_in_at)}
                </span>
              </div>
              <div className="mt-1.5 text-xs">{verification(r)}</div>
              {r.correction_reason && (
                <div className="mt-1 text-xs text-slate-400">Reason: {r.correction_reason}</div>
              )}
              <div className="mt-1">{rowActions(r)}</div>
            </div>
          ))}
        </div>

        {loading && rows.length === 0 && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <EmptyState
            title={hasFilters ? "No matching attendance" : "No attendance yet"}
            message={
              hasFilters
                ? "Try different search or filter values."
                : "Members check in by scanning the gym's QR code and verifying their location. Manual check-ins can be recorded with the button above."
            }
          />
        )}

        {count > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-400">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-8 text-xs"
                disabled={page <= 1 || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                Prev
              </Button>
              <Button
                variant="secondary"
                className="h-8 text-xs"
                disabled={page >= totalPages || loading}
                onClick={() => {
                  setLoading(true);
                  setPage((p) => p + 1);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Manual check-in */}
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Record attendance manually">
        <div className="space-y-4">
          <Field label="Member" hint="Recorded with an audit trail under your admin account.">
            <Select value={manualMember} onChange={(e) => setManualMember(e.target.value)}>
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Attendance date" hint="Gym local date.">
            <Input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
            />
          </Field>
          <Field label="Reason / note (optional)" hint="Saved to the audit log.">
            <Textarea
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              placeholder="e.g. member forgot their phone"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveManual()} loading={manualSaving}>
              Record attendance
            </Button>
          </div>
        </div>
      </Modal>

      {/* Correction / void */}
      <Modal
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title="Correct attendance record"
      >
        {voidTarget && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-medium text-slate-800">
                {voidTarget.member?.full_name ?? "Member"}
              </span>{" "}
              — {formatDate(voidTarget.attendance_date)} at {fmtTime(voidTarget.check_in_at)} ·{" "}
              <span className="font-mono text-xs">{voidTarget.confirmation_reference}</span>
            </div>
            <p className="text-sm text-slate-500">
              Voiding removes this record from today&apos;s counts and frees the member to check in
              again. The action is written to the audit log.
            </p>
            <Field label="Reason for correction" hint="Required — stored in the audit log.">
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. duplicate entry made at the front desk"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoidTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void saveVoid()} loading={voidSaving}>
                Void record
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Member history */}
      <Modal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={`Attendance history${historyFor ? ` — ${historyFor.name}` : ""}`}
        wide
      >
        <div className="space-y-2">
          {historyLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {!historyLoading && historyRows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              No attendance records for this member yet.
            </p>
          )}
          {!historyLoading &&
            historyRows.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700">
                    {formatDate(r.attendance_date)} · {fmtTime(r.check_in_at)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {r.verification_method === "manual" ? "Manual" : "QR + GPS"}
                    {r.distance_meters != null &&
                      ` · ${Math.round(Number(r.distance_meters))} m`}
                    {" · "}
                    <span className="font-mono">{r.confirmation_reference}</span>
                  </div>
                </div>
                <Badge status={r.status} />
              </div>
            ))}
          {historyFor && (
            <div className="pt-2 text-center">
              <Link
                href={`/members/${historyFor.id}`}
                className="text-sm font-medium text-slate-600 hover:underline"
              >
                Open full member profile →
              </Link>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
