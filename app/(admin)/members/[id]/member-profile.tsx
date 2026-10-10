"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  Calendar,
  IndianRupee,
  Activity,
} from "lucide-react";
import type {
  Member,
  HealthAssessment,
  Invoice,
  Payment,
  HealthReport,
  MembershipPlan,
  AttendanceRecord,
  MemberAttendanceToken,
} from "@/lib/types";
import { AttendanceSection } from "./attendance-section";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { EmptyState } from "@/components/skeleton";
import { formatDate, formatCurrency, monthLabel, initials } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const TABS = [
  "Overview",
  "Health",
  "Bills",
  "Payments",
  "Reports",
  "Attendance",
  "Activity",
] as const;

export function MemberProfile({
  member,
  assessments,
  invoices,
  payments,
  reports,
  plans,
  attendanceToken,
  attendance,
  timezone,
}: {
  member: Member;
  assessments: HealthAssessment[];
  invoices: Invoice[];
  payments: Payment[];
  reports: HealthReport[];
  plans: MembershipPlan[];
  attendanceToken: MemberAttendanceToken | null;
  attendance: AttendanceRecord[];
  timezone: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const router = useRouter();

  const cur = assessments[0] ?? null;
  const prev = assessments[1] ?? null;
  const lastPayment = payments[0] ?? null;
  const pendingInvoice = invoices.find((i) => i.status === "pending" || i.status === "overdue");

  const plan = plans.find((p) => p.id === member.membership_plan_id);
  const weightData = [...assessments]
    .reverse()
    .map((a) => ({ date: formatDate(a.assessment_date), weight: Number(a.weight_kg) || null }));
  const fatData = [...assessments]
    .reverse()
    .map((a) => ({ date: formatDate(a.assessment_date), fat: Number(a.body_fat_pct) || null }));
  const waistData = [...assessments]
    .reverse()
    .map((a) => ({ date: formatDate(a.assessment_date), waist: Number(a.waist_cm) || null }));

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.push("/members")}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to members
      </button>

      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-lg font-bold text-white">
            {initials(member.full_name)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">
                {member.full_name}
              </h1>
              <Badge status={member.status} />
            </div>

            <div className="mt-2 space-y-1 text-sm text-slate-500">
              {member.phone_number && (
                <div className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {member.phone_number}
                </div>
              )}
              {member.whatsapp_number && (
                <div className="inline-flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {member.whatsapp_number}
                </div>
              )}
              <div className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Expires {formatDate(member.membership_end_date)}
              </div>
            </div>
          </div>

          <Link
            href={`/whatsapp?member=${member.id}`}
            className="w-full rounded-xl bg-slate-900 px-3.5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:w-auto"
          >
            Send Monthly Report
          </Link>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto scroll-x border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-1">
            <CardHeader title="Membership" />
            <dl className="divide-y divide-slate-50 text-sm">
              {[
                ["Plan", plan?.name ?? "—"],
                ["Start", formatDate(member.membership_start_date)],
                ["End", formatDate(member.membership_end_date)],
                ["Monthly fee", formatCurrency(member.monthly_fee)],
                ["Joined", formatDate(member.joining_date)],
                ["Next due", pendingInvoice ? formatDate(pendingInvoice.due_date) : "—"],
                ["Last payment", lastPayment ? formatDate(lastPayment.payment_date) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5 lg:col-span-1">
            <CardHeader title="Contact" />
            <dl className="divide-y divide-slate-50 text-sm">
              {[
                ["Phone", member.phone_number ?? "—"],
                ["WhatsApp", member.whatsapp_number ?? "—"],
                ["DOB", formatDate(member.date_of_birth)],
                ["Gender", member.gender ?? "—"],
                ["Emergency", member.emergency_contact ?? "—"],
                ["Address", member.address ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-5 lg:col-span-1">
            <CardHeader title="Current Health" />
            {cur ? (
              <dl className="divide-y divide-slate-50 text-sm">
                {[
                  ["Weight", cur.weight_kg ? `${cur.weight_kg} kg` : "—"],
                  ["Previous", prev?.weight_kg ? `${prev.weight_kg} kg` : "—"],
                  [
                    "Change",
                    cur.weight_kg && prev?.weight_kg
                      ? `${(Number(cur.weight_kg) - Number(prev.weight_kg)).toFixed(1)} kg`
                      : "—",
                  ],
                  ["BMI", cur.bmi ?? "—"],
                  ["Body fat", cur.body_fat_pct ? `${cur.body_fat_pct}%` : "—"],
                  ["Waist", cur.waist_cm ? `${cur.waist_cm} cm` : "—"],
                  ["BP", cur.blood_pressure ?? "—"],
                  ["RHR", cur.resting_heart_rate ? `${cur.resting_heart_rate} bpm` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-medium text-slate-700">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <EmptyState
                title="No health assessment yet"
                message={"Add the first health assessment\nto start tracking this member's progress."}
              />
            )}
          </Card>
        </div>
      )}

      {tab === "Health" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {[
              ["Weight Progress", weightData, "weight", "#0f172a"],
              ["Body Fat Progress", fatData, "fat", "#f59e0b"],
              ["Waist Progress", waistData, "waist", "#10b981"],
            ].map(([title, data, key, color]) => (
              <Card key={title as string}>
                <CardHeader title={title as string} />
                <div className="p-4">
                  {assessments.length < 2 ? (
                    <p className="py-10 text-center text-sm text-slate-400">
                      Needs 2+ assessments to show progress
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data as { date: string; [k: string]: unknown }[]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={["auto", "auto"]} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey={key as string}
                          stroke={color as string}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Assessment History" subtitle="Each assessment keeps its own date — history is never overwritten" />
            <div className="overflow-x-auto scroll-x">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                    {["Date", "Weight", "Height", "BMI", "Fat %", "Waist", "BP", "RHR"].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{formatDate(a.assessment_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{a.weight_kg ? `${a.weight_kg} kg` : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.height_cm ? `${a.height_cm} cm` : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.bmi ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.body_fat_pct ? `${a.body_fat_pct}%` : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.waist_cm ? `${a.waist_cm} cm` : "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.blood_pressure ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{a.resting_heart_rate ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === "Bills" && (
        <Card>
          <CardHeader title="Bills" action={<Link href="/billing" className="text-xs text-slate-500 hover:text-slate-700">Open billing →</Link>} />
          {invoices.length === 0 ? (
            <EmptyState title="No bills yet" message="Generate monthly bills from the Billing page." />
          ) : (
            <div className="overflow-x-auto scroll-x">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                    {["Month", "Amount", "Due", "Status"].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{monthLabel(inv.billing_month)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatCurrency(inv.amount)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(inv.due_date)}</td>
                      <td className="px-4 py-3"><Badge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "Payments" && (
        <Card>
          <CardHeader title="Payments" />
          {payments.length === 0 ? (
            <EmptyState title="No payments yet" message="Payments appear after bills are marked paid." />
          ) : (
            <div className="overflow-x-auto scroll-x">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                    {["Date", "Amount", "Method", "Reference"].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-700">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-slate-600 uppercase">{p.payment_method}</td>
                      <td className="px-4 py-3 text-slate-500">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "Reports" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3">
              <Card>
                <EmptyState
                  title="No health reports yet"
                  message="Generate a monthly health report to share with this member."
                />
              </Card>
            </div>
          ) : (
            reports.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Activity className="h-4 w-4 text-slate-400" />
                    {monthLabel(r.report_month)}
                  </div>
                  <Badge status={r.token_revoked ? "cancelled" : "active"} />
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-slate-500">{r.summary_text ?? "—"}</p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/report/${r.share_token}`}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    target="_blank"
                  >
                    Open link
                  </Link>
                  <Link
                    href={`/health?report=${r.id}`}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    WhatsApp
                  </Link>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "Attendance" && (
        <AttendanceSection
          memberId={member.id}
          token={attendanceToken}
          attendance={attendance}
          timezone={timezone}
        />
      )}

      {tab === "Activity" && (
        <Card>
          <CardHeader title="Activity" subtitle="Profile change history is tracked in audit logs" />
          <div className="p-5 text-sm text-slate-500">
            <p>
              Member since <strong>{formatDate(member.joining_date)}</strong>. Last updated{" "}
              {formatDate(member.updated_at)}.
            </p>
            {member.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Notes
                </div>
                {member.notes}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
