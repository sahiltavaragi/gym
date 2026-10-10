"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Crosshair, Eye, MapPin, QrCode, ShieldAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field } from "@/components/input";
import { Modal } from "@/components/modal";
import type { AttendanceSettings, DuplicatePolicy, QrMode } from "@/lib/types";
import { saveAttendanceSettings } from "@/lib/actions/attendance";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

/** Display-only distance between old and new coordinates. */
function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function AttendanceSettingsClient({
  settings,
  logoUrl,
}: {
  settings: AttendanceSettings | null;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [form, setForm] = useState({
    gym_name: settings?.gym_name ?? "FitGym",
    latitude: settings?.latitude != null ? String(settings.latitude) : "",
    longitude: settings?.longitude != null ? String(settings.longitude) : "",
    allowed_radius_meters: String(settings?.allowed_radius_meters ?? 50),
    max_gps_accuracy_meters: String(settings?.max_gps_accuracy_meters ?? 50),
    timezone: settings?.timezone ?? "Asia/Kolkata",
    qr_validity_seconds: String(settings?.qr_validity_seconds ?? 60),
    qr_mode: (settings?.qr_mode ?? "rotating") as QrMode,
    duplicate_policy: (settings?.duplicate_policy ?? "daily") as DuplicatePolicy,
  });

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const hasCoords = form.latitude.trim() !== "" && form.longitude.trim() !== "";
  const coordsChanged =
    Number(form.latitude || 0) !== Number(settings?.latitude ?? 0) ||
    Number(form.longitude || 0) !== Number(settings?.longitude ?? 0);

  const timezoneOptions = TIMEZONES.includes(form.timezone)
    ? TIMEZONES
    : [form.timezone, ...TIMEZONES];

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not supported on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        const maxAcc = Number(form.max_gps_accuracy_meters);
        if (Number.isFinite(maxAcc) && pos.coords.accuracy > maxAcc) {
          toast.warning(
            `Captured, but this device's accuracy is ±${Math.round(pos.coords.accuracy)} m — higher than your ±${maxAcc} m limit.`
          );
        } else {
          toast.success(`Captured (±${Math.round(pos.coords.accuracy)} m) — review and save below`);
        }
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === 1
            ? "Location permission denied. Allow it in your browser settings, or enter coordinates manually."
            : "Could not get your location. Enter coordinates manually."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function doSave(confirmed: boolean) {
    const latRaw = form.latitude.trim();
    const lngRaw = form.longitude.trim();
    if ((latRaw === "") !== (lngRaw === "")) {
      return toast.error("Enter both latitude and longitude, or clear both.");
    }
    const latitude = latRaw === "" ? null : Number(latRaw);
    const longitude = lngRaw === "" ? null : Number(lngRaw);
    if (latitude != null && (Number.isNaN(latitude) || Number.isNaN(Number(lngRaw)))) {
      return toast.error("Coordinates must be numbers.");
    }

    setSaving(true);
    const res = await saveAttendanceSettings({
      gym_name: form.gym_name,
      latitude,
      longitude,
      allowed_radius_meters: Number(form.allowed_radius_meters),
      max_gps_accuracy_meters: Number(form.max_gps_accuracy_meters),
      timezone: form.timezone,
      qr_validity_seconds: Number(form.qr_validity_seconds),
      qr_mode: form.qr_mode,
      duplicate_policy: form.duplicate_policy,
      confirmed,
    });
    setSaving(false);
    if (res.error) {
      if (res.error === "REVIEW_REQUIRED") {
        setReviewOpen(true);
        return;
      }
      return toast.error(res.error);
    }
    setReviewOpen(false);
    toast.success("Attendance settings saved");
    router.refresh();
  }

  function onSaveClick() {
    if (hasCoords && (coordsChanged || !settings?.location_configured)) {
      setReviewOpen(true);
      return;
    }
    void doSave(false);
  }

  const moveDistance =
    hasCoords &&
    settings?.latitude != null &&
    settings?.longitude != null &&
    coordsChanged
      ? Math.round(
          haversine(
            settings.latitude,
            settings.longitude,
            Number(form.latitude),
            Number(form.longitude)
          )
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Gym logo"
              className="h-10 w-10 rounded-xl border border-slate-200 bg-white object-cover"
            />
          ) : null}
          <div>
            <h1 className="text-xl font-bold text-slate-800">Settings → Attendance</h1>
            <p className="text-sm text-slate-500">
              Gym location, GPS rules, QR codes and check-in policy
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              settings?.location_configured
                ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-600 ring-rose-200"
            }`}
          >
            {settings?.location_configured ? "Location active" : "Location not set"}
          </span>
          <Link
            href="/attendance/qr"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <QrCode className="h-3.5 w-3.5" /> QR Display
          </Link>
        </div>
      </div>

      {/* Location */}
      <Card>
        <CardHeader
          title="Gym location"
          subtitle="Members must be within the allowed radius of these coordinates"
          action={
            <Button
              variant="secondary"
              className="h-9 text-xs"
              onClick={captureLocation}
              loading={locating}
            >
              <Crosshair className="h-4 w-4" /> Use my current location
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Gym name">
              <Input
                value={form.gym_name}
                onChange={(e) => set("gym_name", e.target.value)}
                maxLength={100}
              />
            </Field>
          </div>
          <Field
            label="Latitude"
            hint="-90 to 90. Tap the button above or type manually."
          >
            <Input
              value={form.latitude}
              onChange={(e) => set("latitude", e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 12.971599"
            />
          </Field>
          <Field label="Longitude" hint="-180 to 180.">
            <Input
              value={form.longitude}
              onChange={(e) => set("longitude", e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 77.594566"
            />
          </Field>
          <Field
            label="Allowed GPS radius (metres)"
            hint="Default50 m — how far from the coordinates a member may check in."
          >
            <Input
              type="number"
              min={10}
              max={1000}
              value={form.allowed_radius_meters}
              onChange={(e) => set("allowed_radius_meters", e.target.value)}
            />
          </Field>
          <Field
            label="Maximum GPS accuracy (metres)"
            hint="Check-ins with worse accuracy are rejected. Default50 m."
          >
            <Input
              type="number"
              min={5}
              max={1000}
              value={form.max_gps_accuracy_meters}
              onChange={(e) => set("max_gps_accuracy_meters", e.target.value)}
            />
          </Field>

          {hasCoords && (
            <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 sm:col-span-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p>
                Pending coordinates:{" "}
                <span className="font-mono font-medium">
                  {form.latitude}, {form.longitude}
                </span>
                {moveDistance != null && (
                  <>
                    {" "}— <strong>{moveDistance} m</strong> from the currently active location.
                  </>
                )}
                {settings?.location_configured && !coordsChanged && (
                  <> — matches the active location.</>
                )}
                {!settings?.location_configured && (
                  <> — not active yet; review and save to activate.</>
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* QR + timezone */}
      <Card>
        <CardHeader
          title="QR codes & timezone"
          subtitle="Rotating codes are short-lived; permanent codes are printable but weaker"
        />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <span className="text-xs font-medium text-slate-600">QR code mode</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={() => set("qr_mode", "rotating")}
                className={`rounded-xl border p-3 text-left transition ${
                  form.qr_mode === "rotating"
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">
                  Rotating (recommended)
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  A fresh unpredictable code every {form.qr_validity_seconds || 60}s. Photographed
                  codes stop working quickly.
                </div>
              </button>
              <button
                onClick={() => set("qr_mode", "permanent")}
                className={`rounded-xl border p-3 text-left transition ${
                  form.qr_mode === "permanent"
                    ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="text-sm font-semibold text-slate-800">Permanent (fallback)</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  One stable code you can print — but anyone who photographs it can use it until
                  revoked.
                </div>
              </button>
            </div>
            {form.qr_mode === "permanent" && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Permanent mode is weaker: the QR payload cannot expire, so rotation cannot protect
                a photographed code. Switching modes revokes all outstanding codes.
              </div>
            )}
          </div>

          {form.qr_mode === "rotating" && (
            <Field
              label="QR validity (seconds)"
              hint="15–3600 s. Default60 s."
            >
              <Input
                type="number"
                min={15}
                max={3600}
                value={form.qr_validity_seconds}
                onChange={(e) => set("qr_validity_seconds", e.target.value)}
              />
            </Field>
          )}

          <Field label="Attendance timezone" hint="Used for daily check-in limits and display.">
            <Select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {/* Policy */}
      <Card>
        <CardHeader
          title="Check-in policy"
          subtitle="How duplicate check-ins are handled"
        />
        <div className="space-y-4 p-5">
          <Field label="Duplicate prevention">
            <Select
              value={form.duplicate_policy}
              onChange={(e) => set("duplicate_policy", e.target.value as DuplicatePolicy)}
            >
              <option value="daily">One check-in per member per day (recommended)</option>
              <option value="multiple">
                Allow multiple check-ins per day (multi-session gyms)
              </option>
            </Select>
          </Field>
          <p className="text-xs text-slate-400">
            {form.duplicate_policy === "daily"
              ? "Members scanning again the same day see “Your attendance has already been recorded today.” Duplicate rows are blocked by the database itself, so simultaneous scans cannot slip through."
              : "Members may record several check-ins on the same day (e.g. morning + evening sessions)."}
          </p>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/attendance">
          <Button variant="secondary">Back to attendance</Button>
        </Link>
        <Button onClick={onSaveClick} loading={saving}>
          <Eye className="h-4 w-4" /> Review &amp; Save
        </Button>
      </div>

      {/* Review before coordinates go live */}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review location before it goes live"
      >
        <div className="space-y-4">
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            <Row label="Gym" value={form.gym_name} />
            <Row
              label="Coordinates"
              value={`${form.latitude || "—"}, ${form.longitude || "—"}`}
              mono
            />
            <Row label="Allowed radius" value={`${form.allowed_radius_meters} m`} />
            <Row label="Max GPS accuracy" value={`±${form.max_gps_accuracy_meters} m`} />
            <Row label="Timezone" value={form.timezone} />
            <Row
              label="QR mode"
              value={
                form.qr_mode === "rotating"
                  ? `Rotating every ${form.qr_validity_seconds}s`
                  : "Permanent"
              }
            />
            <Row
              label="Duplicate policy"
              value={form.duplicate_policy === "daily" ? "One per day" : "Multiple per day"}
            />
          </div>
          {moveDistance != null && (
            <p className="text-sm text-amber-700">
              This moves the gym location by about <strong>{moveDistance} m</strong>. Existing QR
              codes keep working, but members outside the new radius will be rejected immediately
              after saving.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void doSave(true)} loading={saving}>
              Confirm &amp; activate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-right text-sm font-medium text-slate-800 ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
