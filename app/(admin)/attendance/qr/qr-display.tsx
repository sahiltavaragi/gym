"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Printer,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/button";
import type { AttendanceSettings } from "@/lib/types";

type QrState = {
  url: string;
  expiresAt: string;
  mode: "rotating" | "permanent";
  validitySeconds: number;
  svg: string;
};

type SizeKey = "normal" | "large" | "full";

const SIZE_BUTTONS: { key: SizeKey; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "large", label: "Large" },
  { key: "full", label: "Full screen" },
];

const SIZE_CLASS: Record<SizeKey, string> = {
  normal: "w-[260px] sm:w-[320px]",
  large: "w-[min(85vw,460px)]",
  full: "w-[min(86vw,52vh)]",
};

export function QrDisplay({
  settings,
  gymName,
  logoUrl,
}: {
  settings: AttendanceSettings | null;
  gymName: string;
  logoUrl: string | null;
}) {
  const [qr, setQr] = useState<QrState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [size, setSize] = useState<SizeKey>("normal");
  const [regenerating, setRegenerating] = useState(false);
  const refreshingRef = useRef(false);

  const issue = useCallback(async (force: boolean) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (force) setRegenerating(true);
    try {
      const res = await fetch("/api/attendance/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.status === 401) {
        setLoadError("Your admin session expired. Sign in again to show the QR code.");
        return;
      }
      const json = (await res.json().catch(() => null)) as {
        data?: {
          url: string;
          expiresAt: string;
          mode: "rotating" | "permanent";
          validitySeconds: number;
        };
      } | null;
      if (!res.ok || !json?.data) {
        setLoadError("Could not load the QR code. Check your connection and retry.");
        return;
      }
      const svg = await QRCode.toString(json.data.url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      // Render the new code fully before swapping, so the display never
      // shows a partial or blank QR while it refreshes.
      setQr({ ...json.data, svg });
      setLoadError(null);
    } catch {
      setLoadError("Could not reach the server. Check your connection and retry.");
    } finally {
      refreshingRef.current = false;
      setRegenerating(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Local wrapper mirrors the countdown `tick` pattern: nothing from
    // `issue` runs synchronously before its first await when force=false.
    const start = () => {
      void issue(false);
    };
    start();
  }, [issue]);

  // Countdown + automatic refresh. The new token is requested a few
  // seconds before expiry so old and new codes overlap: the screen is
  // always scannable.
  useEffect(() => {
    if (!qr || qr.mode !== "rotating") return;
    const tick = () => {
      const msLeft = new Date(qr.expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.ceil(msLeft / 1000)));
      if (msLeft <= 5000) void issue(false);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qr, issue]);

  const permanentMode = qr?.mode === "permanent";

  const qrBlock = (
    <div
      className={`qr-print-area mx-auto rounded-2xl border border-slate-200 bg-white p-4 text-center sm:p-6 ${
        size === "full" ? SIZE_CLASS.full : SIZE_CLASS[size]
      }`}
    >
      <div className="mb-3 flex items-center justify-center gap-2">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <QrCode className="h-6 w-6 text-slate-800" />
        )}
        <span className="text-sm font-bold text-slate-800">{gymName}</span>
      </div>
      <div
        className="[&_svg]:h-auto [&_svg]:w-full [&_svg]:rounded-lg"
        aria-label="Attendance QR code"
        dangerouslySetInnerHTML={{ __html: qr?.svg ?? "" }}
      />
      <p className="mt-3 text-xs font-medium text-slate-600">
        Scan with your camera to mark attendance
      </p>
      <p className="mt-1 text-[11px] text-slate-400">Location verification required</p>
      {!permanentMode && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          {remaining > 5 ? `Refreshes in ${remaining}s` : "Refreshing…"}
        </p>
      )}
      {permanentMode && (
        <p className="mt-2 inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
          Permanent code — does not expire
        </p>
      )}
    </div>
  );

  const controls = (
    <div className="mx-auto flex max-w-lg flex-wrap items-center justify-center gap-2 print:hidden">
      {SIZE_BUTTONS.map((s) => (
        <button
          key={s.key}
          onClick={() => setSize(s.key)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
            size === s.key
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {s.key === "full" && <Maximize2 className="h-3.5 w-3.5" />}
          {s.label}
        </button>
      ))}
      <button
        onClick={() => void issue(true)}
        disabled={regenerating}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        title="Issue a fresh code now"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
      </button>
      <button
        onClick={() => window.print()}
        disabled={!permanentMode}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        title={
          permanentMode
            ? "Print the QR code"
            : "Rotating codes expire — switch to permanent QR in Settings → Attendance to print"
        }
      >
        <Printer className="h-3.5 w-3.5" /> Print
      </button>
    </div>
  );

  if (size === "full" && qr) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white p-6">
        <button
          onClick={() => setSize("normal")}
          className="absolute right-4 top-4 inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Minimize2 className="h-4 w-4" /> Exit
        </button>
        {qrBlock}
        {controls}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Attendance QR</h1>
          <p className="text-sm text-slate-500">
            Display this at the gym entrance for members to scan
          </p>
        </div>
        <Link
          href="/attendance"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to attendance
        </Link>
      </div>

      {permanentMode && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Permanent QR is on.</span> Weaker security: anyone who
            photographs this code could mark attendance from anywhere until it is revoked. Prefer
            rotating codes — change it in{" "}
            <Link href="/settings/attendance" className="font-semibold underline">
              Settings → Attendance
            </Link>
            .
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-8">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
            Generating QR code…
          </div>
        )}

        {!loading && loadError && (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-sm text-rose-600">{loadError}</p>
            <Button onClick={() => void issue(false)} variant="secondary">
              Retry
            </Button>
          </div>
        )}

        {!loading && !loadError && qr && (
          <div className="space-y-5">
            {qrBlock}
            {controls}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">
        {settings?.qr_mode === "rotating"
          ? `Codes refresh automatically every ${settings?.qr_validity_seconds ?? 60} seconds — scanning always works during the refresh.`
          : "This code does not expire until you regenerate or revoke it."}
      </p>
    </div>
  );
}
