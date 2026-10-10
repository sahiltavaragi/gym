"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  HeartPulse,
  Receipt,
  CreditCard,
  MessageCircle,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  Dumbbell,
  FileText,
  MoreHorizontal,
  ChevronRight,
  ClipboardCheck,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useUser, useSupabase } from "@/components/supabase-provider";
import { toast } from "sonner";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Members", icon: Users },
  { href: "/billing", label: "Bills", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const MORE_NAV = [
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/health", label: "Health", icon: HeartPulse },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/reports", label: "Audit Logs", icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const { user } = useUser();
  const [drawer, setDrawer] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/auth/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex-1 space-y-1 px-3">
      {[...NAV, ...MORE_NAV].map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            onClick={() => {
              setDrawer(false);
              setMoreOpen(false);
            }}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Dumbbell className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">FitGym</div>
            <div className="text-[11px] text-slate-400">Admin Console</div>
          </div>
        </div>
        {nav}
        <div className="border-t border-slate-100 p-3">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <Dumbbell className="h-4 w-4" />
                </div>
                <div className="text-sm font-bold text-slate-800">FitGym</div>
              </div>
              <button onClick={() => setDrawer(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-24">{nav}</div>
            <div className="border-t border-slate-100 p-3">
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
                onClick={() => setDrawer(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-slate-700">
                {NAV.find((n) => pathname.startsWith(n.href))?.label ?? "FitGym"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
              </button>
              <Link href="/settings" className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                  {initials(user?.email || "Admin")}
                </div>
                <span className="hidden text-xs font-medium text-slate-600 sm:block">
                  {user?.email}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 lg:pb-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
          <div className="grid grid-cols-5 gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition",
                    active ? "text-slate-900" : "text-slate-500"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "text-slate-900")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition",
                moreOpen ? "text-slate-900" : "text-slate-500"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </div>
        </nav>

        {moreOpen && (
          <div className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
            {MORE_NAV.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-slate-500" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
