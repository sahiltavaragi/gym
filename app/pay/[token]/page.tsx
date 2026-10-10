import { createClient } from "@/lib/supabase-browser";
import { notFound } from "next/navigation";
import { Dumbbell, QrCode, Banknote, CalendarDays } from "lucide-react";
import { formatCurrency, monthLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Row = {
  gym_name: string;
  upi_id: string | null;
  upi_display_name: string | null;
  upi_qr_url: string | null;
  cash_enabled: boolean;
  cash_instructions: string | null;
  member_name: string;
  billing_month: string;
  amount: number;
  due_date: string;
  status: string;
};

export default async function PublicPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient();

  let rows: Row[] = [];
  try {
    const { data, error } = await supabase.rpc("get_invoice_by_token", { token });
    if (error) throw error;
    rows = (data ?? []) as Row[];
  } catch {
    notFound();
  }

  const r = rows[0];
  if (!r) notFound();

  const upiDeepLink = r.upi_id
    ? `upi://pay?pa=${encodeURIComponent(r.upi_id)}&pn=${encodeURIComponent(
        r.upi_display_name || r.gym_name
      )}&am=${r.amount}&cu=INR`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">{r.gym_name}</h1>
          <p className="text-sm text-slate-500">Monthly Membership</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="border-b border-slate-100 pb-4 text-center">
            <div className="text-sm text-slate-500">{monthLabel(r.billing_month)}</div>
            <div className="mt-1 text-4xl font-bold text-slate-900">
              {formatCurrency(r.amount)}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Due {new Date(r.due_date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
            <div
              className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                r.status === "overdue"
                  ? "bg-rose-100 text-rose-600"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {r.status}
            </div>
          </div>

          {upiDeepLink && (
            <div className="border-b border-slate-100 py-5 text-center">
              <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <QrCode className="h-4 w-4" /> UPI
              </div>
              <div className="text-sm text-slate-600">{r.upi_id}</div>
              {r.upi_qr_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.upi_qr_url}
                  alt="UPI QR code"
                  className="mx-auto mt-3 h-44 w-44 rounded-xl border border-slate-200"
                />
              )}
              <a
                href={upiDeepLink}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Pay {formatCurrency(r.amount)} via UPI
              </a>
            </div>
          )}

          {r.cash_enabled && (
            <div className="pt-5 text-center">
              <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Banknote className="h-4 w-4" /> Cash
              </div>
              <p className="text-sm text-slate-500">
                {r.cash_instructions || "Pay at the reception counter."}
              </p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          Payment status is updated by {r.gym_name} after verification. This page only shows
          your own bill.
        </p>
      </div>
    </div>
  );
}
