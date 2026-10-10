"use client";

import Link from "next/link";
import { Card, CardHeader } from "@/components/card";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  UserCheck,
  Timer,
  UserX,
  IndianRupee,
  Wallet,
  AlertTriangle,
  FileText,
  FileCheck2,
  Send,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky";
};

type DashboardOverviewProps = {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  todayCollection: number;
  monthCollection: number;
  pendingAmount: number;
  pendingBillsCount: number;
  overdueCount: number;
  reportsDue: number;
  reportsCount: number;
  sentMessagesCount: number;
  last7: { day: string; amount: number }[];
  last6: { month: string; amount: number }[];
  membershipData: { name: string; value: number; color: string }[];
  paymentData: { name: string; value: number; color: string }[];
  newMemberSub: string;
  revenueSub: string;
  todayLabel: string;
};

function StatCard({ label, value, sub, icon: Icon, tone = "slate" }: StatCardProps) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    rose: "bg-rose-100 text-rose-600",
    sky: "bg-sky-100 text-sky-600",
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-slate-500">{label}</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-800">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
        </div>
        <div className={`rounded-xl p-2.5 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

export function DashboardOverview({
  total,
  active,
  expiring,
  expired,
  todayCollection,
  monthCollection,
  pendingAmount,
  pendingBillsCount,
  overdueCount,
  reportsDue,
  reportsCount,
  sentMessagesCount,
  last7,
  last6,
  membershipData,
  paymentData,
  newMemberSub,
  revenueSub,
  todayLabel,
}: DashboardOverviewProps) {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-4 text-white shadow-sm md:p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-300">Good Morning, Admin 👋</p>
        <h1 className="mt-2 text-2xl font-bold">FitGym</h1>
        <p className="mt-1 text-sm text-slate-200">{todayLabel}</p>
        <Link
          href="/members?add=1"
          className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
        >
          + Add Member
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard label="Active Members" value={active} icon={UserCheck} tone="emerald" />
        <StatCard label="Pending Bills" value={formatCurrency(pendingAmount)} icon={AlertTriangle} tone="amber" />
        <StatCard label="Today's Collection" value={formatCurrency(todayCollection)} icon={IndianRupee} tone="emerald" />
        <StatCard label="Reports Due" value={reportsDue} icon={FileText} tone="amber" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[{ label: "Total Members", value: total, icon: Users, tone: "slate" }, { label: "Expiring Soon", value: expiring, icon: Timer, tone: "amber" }, { label: "Overdue Bills", value: overdueCount, icon: FileText, tone: "rose" }].map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} tone={item.tone as "slate" | "amber" | "rose"} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[
          { label: "This Month", value: formatCurrency(monthCollection), icon: Wallet, tone: "sky" },
          { label: "Reports", value: reportsCount, icon: FileCheck2, tone: "sky" },
          { label: "Sent", value: sentMessagesCount, icon: Send, tone: "emerald" },
        ].map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} tone={item.tone as "sky" | "emerald"} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Health Update", "/health?add=1"],
          ["Generate Bills", "/billing?generate=1"],
          ["Send Reports", "/whatsapp"],
          ["View Members", "/members"],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-center text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue" subtitle="Collections over the last 6 months" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={last6}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(
                    value: number | string | readonly (number | string)[] | undefined
                  ) => formatCurrency(Number(Array.isArray(value) ? value[0] ?? 0 : value ?? 0))}
                />
                <Area type="monotone" dataKey="amount" stroke="#0f172a" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Membership" subtitle="Distribution" />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={membershipData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={3}>
                  {membershipData.map((e) => (
                    <Cell key={e.name} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
