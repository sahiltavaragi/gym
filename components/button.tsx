"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  loading,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-slate-900 text-white hover:bg-slate-800",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        variant === "danger" &&
          "bg-rose-600 text-white hover:bg-rose-700",
        variant === "ghost" &&
          "text-slate-600 hover:bg-slate-100",
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
