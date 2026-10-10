"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Smartphone } from "lucide-react";

const STORAGE_KEY = "fitgym_attendance_device_token";

export function SaveDevice({ token }: { token: string }) {
  const [saved, setSaved] = useState(false);

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, token);
      setSaved(true);
      toast.success("Saved — this device is now linked to your attendance");
    } catch {
      toast.error("Could not save on this device (private browsing?)");
    }
  }

  if (saved) {
    return (
      <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Saved on this device
      </div>
    );
  }

  return (
    <button
      onClick={save}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-800"
    >
      <Smartphone className="h-5 w-5" /> Save this device
    </button>
  );
}
