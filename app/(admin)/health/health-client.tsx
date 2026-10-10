"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, FileText, Send, Link2, Copy } from "lucide-react";
import type { HealthAssessment, HealthReport, GymSettings } from "@/lib/types";
import { addAssessment, generateHealthReport, revokeReportToken } from "@/lib/actions/health";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field, Textarea } from "@/components/input";
import { Modal } from "@/components/modal";
import { EmptyState } from "@/components/skeleton";
import { formatDate, monthLabel, monthKey } from "@/lib/utils";

type MemberLite = { id: string; full_name: string; status: string; whatsapp_number: string | null };

const schema = z.object({
  member_id: z.string().min(1, "Select a member"),
  assessment_date: z.string().min(1),
  weight_kg: z.coerce.number().positive().optional().or(z.literal("")),
  height_cm: z.coerce.number().positive().optional().or(z.literal("")),
  body_fat_pct: z.coerce.number().min(0).max(100).optional().or(z.literal("")),
  chest_cm: z.coerce.number().positive().optional().or(z.literal("")),
  waist_cm: z.coerce.number().positive().optional().or(z.literal("")),
  arms_cm: z.coerce.number().positive().optional().or(z.literal("")),
  thigh_cm: z.coerce.number().positive().optional().or(z.literal("")),
  blood_pressure: z.string().optional(),
  resting_heart_rate: z.coerce.number().int().min(20).max(250).optional().or(z.literal("")),
  notes: z.string().optional(),
  trainer_notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function bmiPreview(w?: string | number, h?: string | number) {
  const wf = Number(w), hf = Number(h);
  if (!wf || !hf) return null;
  return (wf / Math.pow(hf / 100, 2)).toFixed(1);
}

export function HealthClient({
  members,
  assessments,
  reports,
  settings,
}: {
  members: MemberLite[];
  assessments: HealthAssessment[];
  reports: HealthReport[];
  settings: GymSettings | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(params.get("add") === "1");
  const [saving, setSaving] = useState(false);
  const [genOpen, setGenOpen] = useState(params.get("generate") === "1");
  const [genMember, setGenMember] = useState("");
  const [genMonth, setGenMonth] = useState(monthKey());
  const [genLoading, setGenLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      assessment_date: new Date().toISOString().slice(0, 10),
      member_id: "",
    },
  });

  const weight = watch("weight_kg");
  const height = watch("height_cm");
  const bmi = bmiPreview(weight, height);

  const filteredAssessments = useMemo(() => {
    if (!selectedMember) return assessments;
    return assessments.filter((a) => a.member_id === selectedMember);
  }, [assessments, selectedMember]);

  const filteredReports = useMemo(() => {
    if (!selectedMember) return reports;
    return reports.filter((r) => r.member_id === selectedMember);
  }, [reports, selectedMember]);

  const memberName = (id: string) => members.find((m) => m.id === id)?.full_name ?? "—";

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const clean: Record<string, unknown> = { ...values };
    for (const k of [
      "weight_kg", "height_cm", "body_fat_pct", "chest_cm", "waist_cm",
      "arms_cm", "thigh_cm", "resting_heart_rate",
    ]) {
      clean[k] = values[k as keyof FormValues] === "" || values[k as keyof FormValues] == null
        ? null
        : Number(values[k as keyof FormValues]);
    }
    clean.blood_pressure = values.blood_pressure || null;
    clean.notes = values.notes || null;
    clean.trainer_notes = values.trainer_notes || null;
    const res = await addAssessment(clean as never);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success("Assessment saved");
    setOpen(false);
    reset({ member_id: values.member_id, assessment_date: new Date().toISOString().slice(0, 10) });
    router.refresh();
  }

  async function doGenerate() {
    if (!genMember) return toast.error("Select a member");
    setGenLoading(true);
    const res = await generateHealthReport(genMember, genMonth);
    setGenLoading(false);
    if (res.error) return toast.error(res.error);
    toast.success("Report generated");
    setGenOpen(false);
    router.refresh();
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${location.origin}/report/${token}`);
    toast.success("Secure link copied");
  }

  async function revoke(id: string) {
    const res = await revokeReportToken(id);
    if (res.error) return toast.error(res.error);
    toast.success("Token revoked — old link no longer works");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Health Reports</h1>
          <p className="text-sm text-slate-500">
            {assessments.length} assessments · {reports.length} reports
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setGenOpen(true)}>
            <FileText className="h-4 w-4" /> Generate Report
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Assessment
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
          className="w-auto"
        >
          <option value="">All members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader title="Monthly Reports" subtitle="Share secure token links — no member login required" />
        {filteredReports.length === 0 ? (
          <EmptyState
            title="No reports yet"
            message="Add a health assessment, then generate a monthly report to share via WhatsApp."
            action={
              <Button onClick={() => setGenOpen(true)}>
                <FileText className="h-4 w-4" /> Generate Report
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredReports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-40 flex-1">
                  <div className="text-sm font-medium text-slate-700">
                    {memberName(r.member_id)} · {monthLabel(r.report_month)}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                    {r.summary_text ?? "No summary"}
                  </div>
                </div>
                <Badge status={r.token_revoked ? "cancelled" : "active"} />
                <div className="flex gap-1.5">
                  <Link
                    href={`/report/${r.share_token}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Open
                  </Link>
                  <button
                    onClick={() => copyLink(r.share_token)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </button>
                  <button
                    onClick={() => revoke(r.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-rose-500 hover:bg-rose-50"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Assessment History" subtitle="Newest first" />
        {filteredAssessments.length === 0 ? (
          <EmptyState
            title="No health assessment yet"
            message={"Add the first health assessment\nto start tracking this member's progress."}
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Add Health Assessment
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto scroll-x">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                  {["Member", "Date", "Weight", "BMI", "Fat %", "Waist", "BP"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{memberName(a.member_id)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(a.assessment_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{a.weight_kg ? `${a.weight_kg} kg` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.bmi ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.body_fat_pct ? `${a.body_fat_pct}%` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.waist_cm ? `${a.waist_cm} cm` : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{a.blood_pressure ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add assessment modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Health Assessment" wide>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="Member" error={errors.member_id?.message}>
              <Select {...register("member_id")}>
                <option value="">Select member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Assessment Date" error={errors.assessment_date?.message}>
            <Input type="date" {...register("assessment_date")} />
          </Field>
          <Field label="Weight (kg)" error={errors.weight_kg?.message}>
            <Input type="number" step="0.1" {...register("weight_kg")} placeholder="74.0" />
          </Field>
          <Field label="Height (cm)" error={errors.height_cm?.message}>
            <Input type="number" step="0.1" {...register("height_cm")} placeholder="175" />
          </Field>
          <Field label="BMI" hint={bmi ? `Auto-calculated: ${bmi}` : "Enter weight + height to auto-calculate"}>
            <Input value={bmi ?? ""} readOnly placeholder="auto" className="bg-slate-50" />
          </Field>
          <Field label="Body Fat %" error={errors.body_fat_pct?.message}>
            <Input type="number" step="0.1" {...register("body_fat_pct")} placeholder="18.5" />
          </Field>
          <Field label="Waist (cm)" error={errors.waist_cm?.message}>
            <Input type="number" step="0.1" {...register("waist_cm")} placeholder="82" />
          </Field>
          <Field label="Chest (cm)">
            <Input type="number" step="0.1" {...register("chest_cm")} />
          </Field>
          <Field label="Arms (cm)">
            <Input type="number" step="0.1" {...register("arms_cm")} />
          </Field>
          <Field label="Thighs (cm)">
            <Input type="number" step="0.1" {...register("thigh_cm")} />
          </Field>
          <Field label="Blood Pressure">
            <Input {...register("blood_pressure")} placeholder="120/80" />
          </Field>
          <Field label="Resting Heart Rate" error={errors.resting_heart_rate?.message}>
            <Input type="number" {...register("resting_heart_rate")} placeholder="62" />
          </Field>
          <div className="sm:col-span-3">
            <Field label="Notes">
              <Textarea {...register("notes")} />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="Trainer Notes">
              <Textarea {...register("trainer_notes")} placeholder="Continue current workout and diet plan." />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save assessment
            </Button>
          </div>
        </form>
      </Modal>

      {/* Generate report modal */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate Monthly Report">
        <div className="space-y-4">
          <Field label="Member">
            <Select value={genMember} onChange={(e) => setGenMember(e.target.value)}>
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Report Month">
            <Input type="month" value={genMonth.slice(0, 7)} onChange={(e) => setGenMonth(e.target.value + "-01")} />
          </Field>
          <p className="text-xs text-slate-500">
            Compares the two most recent assessments on or before this month and creates a
            secure share link. Regenerating never duplicates the report.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doGenerate} loading={genLoading}>
              <FileText className="h-4 w-4" /> Generate
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
