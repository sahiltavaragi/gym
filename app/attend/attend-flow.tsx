"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Dumbbell,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { attendanceMessage } from "@/lib/attendance/messages";

const STORAGE_KEY = "fitgym_attendance_device_token";

type GymInfo = {
  name: string;
  logoUrl: string | null;
  timezone: string;
  allowedRadiusMeters: number;
  duplicatePolicy: "daily" | "multiple";
};

type MemberInfo = { name: string; eligible: boolean; alreadyCheckedIn: boolean };

type Success = {
  reference: string;
  memberName: string;
  gymName: string;
  checkInAt: string;
  attendanceDate: string;
  distanceMeters: number;
};

type Phase =
  | "loading"
  | "needsCode"
  | "ready"
  | "locating"
  | "submitting"
  | "success"
  | "error";

type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code?: string; message?: string } };

async function postJson(path: string, body: unknown): Promise<ApiResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: "NETWORK", message: attendanceMessage("NETWORK") } };
  }
  let json: { data?: Record<string, unknown>; error?: { code?: string; message?: string } } | null =
    null;
  try {
    json = await res.json();
  } catch {
    // non-JSON response
  }
  if (res.ok && json?.data) return { ok: true, data: json.data };
  return {
    ok: false,
    error: json?.error ?? { code: "SERVER_ERROR", message: attendanceMessage("SERVER_ERROR") },
  };
}

export function AttendanceFlow({ qrToken }: { qrToken: string | null }) {
  // No QR in the URL → fail immediately without an effect.
  const [phase, setPhase] = useState<Phase>(() => (qrToken ? "loading" : "error"));
  const [gym, setGym] = useState<GymInfo | null>(null);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(() =>
    qrToken ? null : "QR_MISSING"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    qrToken ? null : attendanceMessage("QR_MISSING")
  );
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [result, setResult] = useState<Success | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const memberTokenRef = useRef<string | null>(null);

  const fail = useCallback((code: string, message?: string) => {
    setErrorCode(code);
    setErrorMessage(message || attendanceMessage(code));
    setPhase("error");
  }, []);

  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;
    (async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      const res = await postJson(
        "/api/attendance/context",
        stored ? { qrToken, memberToken: stored } : { qrToken }
      );
      if (cancelled) return;
      if (!res.ok) {
        const code = res.error.code ?? "SERVER_ERROR";
        // A stored (previously bonded) token that no longer works just
        // falls back to asking for the code — no dead end.
        if (stored && code === "MEMBER_TOKEN_INVALID") {
          localStorage.removeItem(STORAGE_KEY);
          setPhase("needsCode");
          return;
        }
        fail(code, res.error.message);
        return;
      }
      const data = res.data as {
        gym: GymInfo;
        member: MemberInfo | null;
        needsIdentity: boolean;
      };
      setGym(data.gym);
      if (data.member && stored) {
        memberTokenRef.current = stored;
        setMember(data.member);
        setPhase("ready");
      } else {
        setPhase("needsCode");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrToken, fail]);

  async function submitCode() {
    const token = codeInput.trim();
    if (!token || submittingCode) return;
    setSubmittingCode(true);
    setCodeError(null);
    const res = await postJson("/api/attendance/context", { qrToken, memberToken: token });
    setSubmittingCode(false);
    if (!res.ok) {
      setCodeError(res.error.message || attendanceMessage(res.error.code ?? "MEMBER_TOKEN_INVALID"));
      return;
    }
    const data = res.data as { member: MemberInfo | null };
    if (!data.member) {
      setCodeError(attendanceMessage("MEMBER_TOKEN_INVALID"));
      return;
    }
    memberTokenRef.current = token;
    localStorage.setItem(STORAGE_KEY, token);
    setMember(data.member);
    setPhase("ready");
  }

  function switchMember() {
    localStorage.removeItem(STORAGE_KEY);
    memberTokenRef.current = null;
    setMember(null);
    setCodeInput("");
    setCodeError(null);
    setPhase("needsCode");
  }

  function verifyLocation() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErrorCode(null);
    setErrorMessage(null);
    setAccuracy(null);

    if (!navigator.geolocation) {
      busyRef.current = false;
      setBusy(false);
      fail("LOCATION_UNAVAILABLE");
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void submitCoordinates(pos.coords);
      },
      (geoError) => {
        busyRef.current = false;
        setBusy(false);
        fail(geoError.code === 1 ? "PERMISSION_DENIED" : "LOCATION_UNAVAILABLE");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  async function submitCoordinates(coords: GeolocationCoordinates) {
    setAccuracy(coords.accuracy);
    setPhase("submitting");
    const memberToken = memberTokenRef.current;
    if (!memberToken || !qrToken) {
      busyRef.current = false;
      setBusy(false);
      fail("MEMBER_TOKEN_INVALID");
      return;
    }
    const res = await postJson("/api/attendance/mark", {
      qrToken,
      memberToken,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      clientTimestamp: new Date().toISOString(),
    });
    if (!res.ok) {
      busyRef.current = false;
      setBusy(false);
      fail(res.error.code ?? "SERVER_ERROR", res.error.message);
      return;
    }
    setResult(res.data as unknown as Success);
    busyRef.current = false;
    setBusy(false);
    setPhase("success");
  }

  const retryable =
    errorCode &&
    ["PERMISSION_DENIED", "LOCATION_UNAVAILABLE", "NETWORK", "SERVER_ERROR", "GPS_ACCURACY_INSUFFICIENT", "OUTSIDE_RADIUS", "INVALID_COORDINATES"].includes(errorCode);

  const initialsName = (member?.name ?? "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const tz = gym?.timezone ?? "Asia/Kolkata";

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          {gym?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={gym.logoUrl}
              alt={`${gym.name} logo`}
              className="mb-3 h-14 w-14 rounded-2xl border border-slate-200 bg-white object-cover"
            />
          ) : (
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Dumbbell className="h-7 w-7" />
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-800">
            {gym?.name ?? "Gym Attendance"}
          </h1>
          <p className="text-sm text-slate-500">Mark your attendance</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {/* Loading / verifying scan */}
          {phase === "loading" && (
            <div className="flex flex-col items-center py-10 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Verifying QR code…</p>
            </div>
          )}

          {/* Identity: enter personal attendance code */}
          {phase === "needsCode" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <ShieldAlert className="h-4 w-4" /> QR code verified — now confirm your identity
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Who are you?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the personal attendance code you received from the gym (it looks like{" "}
                  <span className="font-mono font-medium text-slate-600">ABCD-EFGH-JKMN-PQRS</span>
                  ). It is printed on your membership card or shared with you privately by the
                  front desk.
                </p>
              </div>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitCode();
                }}
                placeholder="Enter your attendance code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-mono text-lg uppercase tracking-widest text-slate-800 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
              />
              {codeError && (
                <p className="text-sm text-rose-600" role="alert">
                  {codeError}
                </p>
              )}
              <button
                onClick={() => void submitCode()}
                disabled={!codeInput.trim() || submittingCode}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {submittingCode && <Loader2 className="h-4 w-4 animate-spin" />}
                Continue
              </button>
              <p className="text-center text-xs text-slate-400">
                No code yet? Ask the front desk for your personal attendance link.
              </p>
            </div>
          )}

          {/* Identity confirmed — explain location, ask to verify */}
          {phase === "ready" && member && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Scan confirmed &amp; identity verified
              </div>

              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {initialsName || "?"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{member.name}</p>
                  <p className="text-xs text-slate-500">Is this you?</p>
                </div>
                <button
                  onClick={switchMember}
                  className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Not you?
                </button>
              </div>

              {!member.eligible && (
                <div className="flex gap-2 rounded-xl bg-rose-50 px-3 py-3 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {attendanceMessage("MEMBER_INELIGIBLE")}
                </div>
              )}

              {member.alreadyCheckedIn && (
                <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {attendanceMessage("ALREADY_CHECKED_IN")}
                </div>
              )}

              <div className="flex gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  Next, your browser will ask for your location to confirm you are inside the gym
                  {gym ? ` (within ${gym.allowedRadiusMeters} m of ${gym.name})` : ""}. Only the
                  distance — not your precise coordinates — is stored.
                </p>
              </div>

              <button
                onClick={verifyLocation}
                disabled={!member.eligible || busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                <MapPin className="h-5 w-5" />
                Verify Location &amp; Check In
              </button>

              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                GPS location is approximate and can be spoofed by a modified device — this is a
                convenience check, not proof of physical presence.
              </p>
            </div>
          )}

          {/* Locating */}
          {phase === "locating" && (
            <div className="flex flex-col items-center py-10 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">Getting your location…</p>
              <p className="mt-1 text-xs text-slate-500">
                Accept the location permission prompt if your browser shows one.
              </p>
            </div>
          )}

          {/* Submitting */}
          {phase === "submitting" && (
            <div className="flex flex-col items-center py-10 text-center">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">
                Checking your distance to {gym?.name ?? "the gym"}…
              </p>
              {accuracy != null && (
                <p className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  GPS accuracy: ±{Math.round(accuracy)} m
                </p>
              )}
            </div>
          )}

          {/* Success */}
          {phase === "success" && result && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-9 w-9 text-emerald-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">
                Attendance Marked Successfully!
              </h2>
              <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100 text-left">
                <DetailRow label="Member" value={result.memberName} />
                <DetailRow
                  label="Date"
                  value={new Intl.DateTimeFormat("en-IN", {
                    timeZone: tz,
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(result.checkInAt))}
                />
                <DetailRow
                  label="Check-in time"
                  value={new Intl.DateTimeFormat("en-IN", {
                    timeZone: tz,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(result.checkInAt))}
                />
                <DetailRow label="Gym" value={result.gymName} />
                <DetailRow
                  label="Distance"
                  value={`${Math.round(result.distanceMeters)} m from gym`}
                />
                <DetailRow label="Confirmation ref" value={result.reference} mono />
              </div>
              <p className="mt-4 text-xs text-slate-400">
                You can close this page now. Have a great workout! 💪
              </p>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                <AlertTriangle className="h-7 w-7 text-rose-600" />
              </div>
              <p
                className="text-sm font-medium leading-relaxed text-slate-700"
                role="alert"
              >
                {errorMessage ?? attendanceMessage(errorCode)}
              </p>
              <div className="mt-5 space-y-2">
                {retryable && (
                  <button
                    onClick={verifyLocation}
                    disabled={busy}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" /> Try again
                  </button>
                )}
                {errorCode === "MEMBER_TOKEN_INVALID" && (
                  <button
                    onClick={switchMember}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Enter my attendance code
                  </button>
                )}
                {["QR_MISSING", "QR_EXPIRED", "QR_INVALID"].includes(errorCode ?? "") && (
                  <p className="text-xs text-slate-500">
                    Point your camera at the QR code currently displayed at the gym entrance to
                    restart.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
          {gym?.name ?? "The gym"} verifies that you are near the gym using your browser&apos;s
          location. Your exact coordinates are never saved.
        </p>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`text-right text-sm font-medium text-slate-800 ${
          mono ? "font-mono tracking-wide" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
