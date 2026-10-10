import { createAdminClient } from "@/lib/supabase-server";
import { DashboardOverview } from "@/components/dashboard-overview";
import { monthKey } from "@/lib/utils";

export const revalidate = 60;

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const today = new Date();
  const month = monthKey(today);

  const paymentStartDate = new Date(
    Date.UTC(today.getFullYear(), today.getMonth() - 5, 1)
  )
    .toISOString()
    .slice(0, 10)

  const [members, invoices, reports, payments, messages] = await Promise.all([
    supabase.from("members").select("id, status, created_at"),
    supabase.from("invoices").select("amount, status"),
    supabase.from("health_reports").select("id", { count: "exact", head: true }),
    supabase
      .from("payments")
      .select("amount, payment_date")
      .gte("payment_date", paymentStartDate)
      .order("payment_date", { ascending: false }),
    supabase.from("whatsapp_messages").select("id", { count: "exact", head: true }),
  ]);

  const allMembers = members.data ?? [];
  const allInvoices = invoices.data ?? [];
  const reportCount = reports.count ?? 0;
  const allPayments = payments.data ?? [];
  const sentMessagesCount = messages.count ?? 0;

  const active = allMembers.filter(
    (m) => m.status === "active" || m.status === "expiring_soon"
  ).length;
  const expiring = allMembers.filter((m) => m.status === "expiring_soon").length;
  const expired = allMembers.filter((m) => m.status === "expired").length;
  const total = allMembers.length;

  const todayStr = today.toISOString().slice(0, 10);
  const todayCollection = allPayments
    .filter((p) => p.payment_date === todayStr)
    .reduce((s, p) => s + Number(p.amount), 0);
  const monthCollection = allPayments
    .filter((p) => (p.payment_date ?? "").startsWith(month.slice(0, 7)))
    .reduce((s, p) => s + Number(p.amount), 0);
  const pending = allInvoices.filter((i) => i.status === "pending");
  const overdue = allInvoices.filter((i) => i.status === "overdue");
  const pendingAmount = pending.reduce((s, i) => s + Number(i.amount), 0);
  const overdueCount = overdue.length;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      day: d.toLocaleDateString("en-IN", { weekday: "short" }),
      amount: allPayments
        .filter((p) => p.payment_date === key)
        .reduce((s, p) => s + Number(p.amount), 0),
    };
  });

  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: d.toLocaleDateString("en-IN", { month: "short" }),
      amount: allPayments
        .filter((p) => (p.payment_date ?? "").startsWith(key))
        .reduce((s, p) => s + Number(p.amount), 0),
    };
  });

  const membershipData = [
    { name: "Active", value: active, color: "#10b981" },
    { name: "Expiring Soon", value: expiring, color: "#f59e0b" },
    { name: "Expired", value: expired, color: "#f43f5e" },
    { name: "Inactive", value: Math.max(0, total - active - expiring - expired), color: "#94a3b8" },
  ];

  const paymentData = [
    { name: "Paid", value: allInvoices.filter((i) => i.status === "paid").length, color: "#10b981" },
    { name: "Pending", value: pending.length, color: "#f59e0b" },
    { name: "Overdue", value: overdue.length, color: "#f43f5e" },
  ];

  const newThisMonth = allMembers.filter((m) =>
    (m.created_at ?? "").startsWith(month.slice(0, 7))
  ).length;
  const reportsDue = Math.max(0, active - reportCount);
  const newMemberSub = newThisMonth > 0 ? `↑ ${newThisMonth} this month` : "No new members this month";
  const revenueSub =
    monthCollection > 0 ? "This month to date" : "No collections yet this month";

  return (
    <DashboardOverview
      total={total}
      active={active}
      expiring={expiring}
      expired={expired}
      todayCollection={todayCollection}
      monthCollection={monthCollection}
      pendingAmount={pendingAmount}
      pendingBillsCount={pending.length}
      overdueCount={overdueCount}
      reportsDue={reportsDue}
      reportsCount={reportCount}
      sentMessagesCount={sentMessagesCount}
      last7={last7}
      last6={last6}
      membershipData={membershipData}
      paymentData={paymentData}
      newMemberSub={newMemberSub}
      revenueSub={revenueSub}
      todayLabel={today.toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })}
    />
  );
}
