"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto scroll-x border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition",
            value === t.value
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
