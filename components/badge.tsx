import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  delivered: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  present: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  voided: "bg-rose-50 text-rose-600 ring-rose-200",
  expiring_soon: "bg-amber-100 text-amber-700 ring-amber-200",
  pending: "bg-amber-100 text-amber-700 ring-amber-200",
  sent: "bg-sky-100 text-sky-700 ring-sky-200",
  expired: "bg-rose-100 text-rose-700 ring-rose-200",
  overdue: "bg-rose-100 text-rose-700 ring-rose-200",
  failed: "bg-rose-100 text-rose-700 ring-rose-200",
  inactive: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[status] ?? "bg-slate-100 text-slate-600 ring-slate-200",
        className
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
