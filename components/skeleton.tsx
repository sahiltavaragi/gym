import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-slate-200/70", className)} />
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl bg-slate-100 p-3">
        <Inbox className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-sm whitespace-pre-line text-sm text-slate-500">
        {message}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
