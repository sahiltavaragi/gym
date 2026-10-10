import { createClient } from "@/lib/supabase-browser";
import { notFound } from "next/navigation";
import { Dumbbell, Scale, Ruler, Percent, TrendingDown, TrendingUp, Minus } from "lucide-react";

export const dynamic = "force-dynamic";

type Row = {
  member_name: string;
  report_month: string;
  current_weight: number | null;
  previous_weight: number | null;
  body_fat: number | null;
  previous_body_fat: number | null;
  waist: number | null;
  previous_waist: number | null;
  bmi: number | null;
  summary_text: string | null;
  trainer_notes: string | null;
  created_at: string;
};

function Delta({ now, prev, unit }: { now: number | null; prev: number | null; unit: string }) {
  if (now == null || prev == null) return <span className="text-xs text-slate-400">—</span>;
  const diff = Number(now) - Number(prev);
  const Icon = diff < -0.05 ? TrendingDown : diff > 0.05 ? TrendingUp : Minus;
  const good = diff < 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        good ? "text-emerald-600" : diff > 0 ? "text-rose-500" : "text-slate-400"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(diff).toFixed(1)} {unit}
    </span>
  );
}

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient();

  let rows: Row[] = [];
  try {
    const { data, error } = await supabase.rpc("get_report_by_token", {
      token,
    });
    if (error) throw error;
    rows = (data ?? []) as Row[];
  } catch {
    notFound();
  }

  const r = rows[0];
  if (!r) notFound();

  const month = new Date(r.report_month).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold uppercase tracking-wide text-slate-800">
            Monthly Gym Health Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {r.member_name} · {month}
          </p>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Scale, label: "Weight", value: r.current_weight, unit: "kg", prev: r.previous_weight },
              { icon: Percent, label: "Body Fat", value: r.body_fat, unit: "%", prev: r.previous_body_fat },
              { icon: Ruler, label: "Waist", value: r.waist, unit: "cm", prev: r.previous_waist },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-slate-50 p-4 text-center">
                <m.icon className="mx-auto mb-1.5 h-4 w-4 text-slate-400" />
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {m.label}
                </div>
                <div className="mt-1 text-xl font-bold text-slate-800">
                  {m.value ?? "—"}
                  <span className="ml-0.5 text-xs font-normal text-slate-400">{m.unit}</span>
                </div>
                <div className="mt-1">
                  <Delta now={m.value} prev={m.prev} unit={m.unit} />
                </div>
                {m.prev != null && (
                  <div className="mt-0.5 text-[11px] text-slate-400">was {m.prev}</div>
                )}
              </div>
            ))}
          </div>

          {r.bmi != null && (
            <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
              <span className="text-sm text-slate-500">BMI</span>
              <span className="text-base font-semibold text-slate-800">{r.bmi}</span>
            </div>
          )}

          {r.summary_text && (
            <div className="rounded-xl bg-emerald-50 p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
                Progress Summary
              </div>
              <p className="text-sm text-emerald-800">{r.summary_text}</p>
            </div>
          )}

          {r.trainer_notes && (
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Trainer Notes
              </div>
              <p className="text-sm text-slate-600">{r.trainer_notes}</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-400">
          This link is private and can be revoked by your gym at any time.
        </p>
      </div>
    </div>
  );
}
