"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Save } from "lucide-react";
import type { GymSettings, MembershipPlan } from "@/lib/types";
import { updateSettings, uploadQr } from "@/lib/actions/settings";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Textarea, Field } from "@/components/input";
import { Tabs } from "@/components/tabs";
import { formatCurrency } from "@/lib/utils";

const DEFAULT_TEMPLATE = `🏋️ YOUR MONTHLY GYM REPORT

Hello {{member_name}},

Your {{month}} health report is ready.

⚖️ Weight: {{current_weight}} kg
📉 Previous: {{previous_weight}} kg
💪 Body Fat: {{body_fat}}%
📏 Waist: {{waist}} cm

💰 Monthly Fee: {{amount}}
📅 Due Date: {{due_date}}

📄 View Health Report:
{{report_link}}

💳 PAYMENT OPTIONS

🟢 UPI
UPI ID: {{upi_id}}
Please scan the attached QR code to pay {{amount}}.

💵 CASH
{{cash_payment_instructions}}

Thank you! 💪`;

export function SettingsClient({
  settings,
  plans,
}: {
  settings: GymSettings | null;
  plans: MembershipPlan[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [profile, setProfile] = useState({
    gym_name: settings?.gym_name ?? "FitGym",
    address: settings?.address ?? "",
    phone: settings?.phone ?? "",
    whatsapp_number: settings?.whatsapp_number ?? "",
    email: settings?.email ?? "",
    logo_url: settings?.logo_url ?? "",
  });

  const [payment, setPayment] = useState({
    upi_id: settings?.upi_id ?? "",
    upi_display_name: settings?.upi_display_name ?? "",
    upi_qr_url: settings?.upi_qr_url ?? "",
    cash_payment_enabled: settings?.cash_payment_enabled ?? true,
    cash_payment_instructions:
      settings?.cash_payment_instructions ?? "Pay at the reception counter.",
  });

  const [billing, setBilling] = useState({
    default_monthly_fee: settings?.default_monthly_fee ?? 1000,
    default_due_day: settings?.default_due_day ?? 10,
  });

  const [template, setTemplate] = useState(
    settings?.whatsapp_template ?? DEFAULT_TEMPLATE
  );

  async function save(payload: Record<string, unknown>, label: string) {
    setSaving(true);
    const res = await updateSettings(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success(`${label} saved`);
    router.refresh();
  }

  async function handleQrUpload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Upload an image file");
    setUploading(true);
    const res = await uploadQr(file);
    setUploading(false);
    if (res.error) return toast.error(res.error);
    setPayment((p) => ({ ...p, upi_qr_url: res.url! }));
    toast.success("QR uploaded — remember to save Payment Settings");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Gym profile, payments, billing and messaging</p>
      </div>

      <Tabs
        value={tab}
        onChange={(v) => {
          if (v === "attendance") {
            router.push("/settings/attendance");
            return;
          }
          setTab(v);
        }}
        tabs={[
          { value: "profile", label: "Gym Profile" },
          { value: "payment", label: "Payment" },
          { value: "billing", label: "Billing" },
          { value: "whatsapp", label: "WhatsApp" },
          { value: "plans", label: "Plans" },
          { value: "attendance", label: "Attendance" },
        ]}
      />

      {tab === "profile" && (
        <Card>
          <CardHeader title="Gym Profile" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Gym Name">
              <Input value={profile.gym_name} onChange={(e) => setProfile({ ...profile, gym_name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </Field>
            <Field label="WhatsApp Number">
              <Input
                value={profile.whatsapp_number}
                onChange={(e) => setProfile({ ...profile, whatsapp_number: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <Textarea value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
              </Field>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button onClick={() => save(profile, "Gym profile")} loading={saving}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "payment" && (
        <Card>
          <CardHeader title="Payment Settings" subtitle="UPI and cash instructions shown on member payment pages" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="UPI ID" hint="e.g. fitgym@upi">
              <Input value={payment.upi_id} onChange={(e) => setPayment({ ...payment, upi_id: e.target.value })} />
            </Field>
            <Field label="UPI Display Name">
              <Input
                value={payment.upi_display_name}
                onChange={(e) => setPayment({ ...payment, upi_display_name: e.target.value })}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="UPI QR Code">
                <div className="flex items-center gap-3">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {payment.upi_qr_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={payment.upi_qr_url} alt="UPI QR" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">No QR</span>
                    )}
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading…" : "Upload QR"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleQrUpload(e.target.files[0])}
                    />
                  </label>
                </div>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input
                type="checkbox"
                checked={payment.cash_payment_enabled}
                onChange={(e) => setPayment({ ...payment, cash_payment_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Cash payment enabled
            </label>
            <div className="sm:col-span-2">
              <Field label="Cash Payment Instructions">
                <Textarea
                  value={payment.cash_payment_instructions}
                  onChange={(e) =>
                    setPayment({ ...payment, cash_payment_instructions: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button onClick={() => save(payment, "Payment settings")} loading={saving}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "billing" && (
        <Card>
          <CardHeader title="Billing Defaults" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Field label="Default Monthly Fee (₹)">
              <Input
                type="number"
                value={billing.default_monthly_fee}
                onChange={(e) =>
                  setBilling({ ...billing, default_monthly_fee: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Default Due Day (1–28)" hint={`Bills due on day ${billing.default_due_day} of each month`}>
              <Input
                type="number"
                min={1}
                max={28}
                value={billing.default_due_day}
                onChange={(e) => setBilling({ ...billing, default_due_day: Number(e.target.value) })}
              />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button onClick={() => save(billing, "Billing defaults")} loading={saving}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "whatsapp" && (
        <Card>
          <CardHeader
            title="WhatsApp Message Template"
            subtitle="Variables: {{member_name}} {{month}} {{current_weight}} {{previous_weight}} {{body_fat}} {{waist}} {{amount}} {{due_date}} {{report_link}} {{upi_id}} {{cash_payment_instructions}}"
          />
          <div className="space-y-3 p-5">
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="min-h-96 font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button onClick={() => save({ whatsapp_template: template }, "WhatsApp template")} loading={saving}>
                <Save className="h-4 w-4" /> Save Template
              </Button>
            </div>
          </div>
        </Card>
      )}

      {tab === "plans" && (
        <Card>
          <CardHeader title="Membership Plans" subtitle="Used when adding members" />
          <div className="divide-y divide-slate-50">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                <div>
                  <div className="font-medium text-slate-700">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.duration_months} month(s)</div>
                </div>
                <div className="font-medium text-slate-800">
                  {formatCurrency(p.monthly_fee)}
                </div>
              </div>
            ))}
            {plans.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No plans defined.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
