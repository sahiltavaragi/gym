"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Search, Plus, Pencil, Eye, Archive, Phone, MessageCircle } from "lucide-react";
import type { Member, MembershipPlan } from "@/lib/types";
import { createMember, updateMember, archiveMember } from "@/lib/actions/members";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field, Textarea } from "@/components/input";
import { Modal, ConfirmDialog } from "@/components/modal";
import { EmptyState } from "@/components/skeleton";
import { cn, formatDate, initials } from "@/lib/utils";

const schema = z.object({
  full_name: z.string().min(2, "Name is required"),
  phone_number: z.string().optional(),
  whatsapp_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  address: z.string().optional(),
  emergency_contact: z.string().optional(),
  joining_date: z.string().optional(),
  membership_plan_id: z.string().optional(),
  membership_start_date: z.string().optional(),
  membership_end_date: z.string().optional(),
  monthly_fee: z.coerce.number().min(0),
  notes: z.string().optional(),
  status: z.enum(["active", "expiring_soon", "expired", "inactive"]),
});

type FormValues = z.infer<typeof schema>;

export function MembersClient({
  members,
  plans,
}: {
  members: Member[];
  plans: MembershipPlan[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("recent");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState<Member | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: "active",
      monthly_fee: 1000,
      joining_date: new Date().toISOString().slice(0, 10),
    },
  });

  const filtered = useMemo(() => {
    let list = [...members];
    if (q) {
      const s = q.toLowerCase();
      list = list.filter(
        (m) =>
          m.full_name.toLowerCase().includes(s) ||
          (m.phone_number ?? "").includes(s) ||
          (m.whatsapp_number ?? "").includes(s)
      );
    }
    if (statusFilter) list = list.filter((m) => m.status === statusFilter);
    if (sort === "name") list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    else if (sort === "expiry")
      list.sort((a, b) =>
        (a.membership_end_date ?? "9999").localeCompare(b.membership_end_date ?? "9999")
      );
    else list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return list;
  }, [members, q, statusFilter, sort]);

  function openAdd() {
    setEditing(null);
    reset({
      status: "active",
      monthly_fee: plans[0]?.monthly_fee ?? 1000,
      joining_date: new Date().toISOString().slice(0, 10),
      membership_plan_id: plans[0]?.id,
      membership_start_date: new Date().toISOString().slice(0, 10),
      membership_end_date: "",
      phone_number: "",
      whatsapp_number: "",
      date_of_birth: "",
      address: "",
      emergency_contact: "",
      notes: "",
      gender: undefined,
    });
    setOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    reset({
      full_name: m.full_name,
      phone_number: m.phone_number ?? "",
      whatsapp_number: m.whatsapp_number ?? "",
      date_of_birth: m.date_of_birth ?? "",
      gender: (m.gender as FormValues["gender"]) ?? undefined,
      address: m.address ?? "",
      emergency_contact: m.emergency_contact ?? "",
      joining_date: m.joining_date,
      membership_plan_id: m.membership_plan_id ?? "",
      membership_start_date: m.membership_start_date ?? "",
      membership_end_date: m.membership_end_date ?? "",
      monthly_fee: m.monthly_fee,
      notes: m.notes ?? "",
      status: m.status,
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const payload: Record<string, unknown> = {
      ...values,
      membership_plan_id: values.membership_plan_id || null,
      phone_number: values.phone_number || null,
      whatsapp_number: values.whatsapp_number || null,
      date_of_birth: values.date_of_birth || null,
      address: values.address || null,
      emergency_contact: values.emergency_contact || null,
      membership_start_date: values.membership_start_date || null,
      membership_end_date: values.membership_end_date || null,
      notes: values.notes || null,
      gender: values.gender ?? null,
    };
    const res = editing
      ? await updateMember(editing.id, payload)
      : await createMember(payload as unknown as Member);
    setSaving(false);
    if (res.error) return toast.error(res.error);
    toast.success(editing ? "Member updated" : "Member added");
    setOpen(false);
    router.refresh();
  }

  async function doArchive() {
    if (!archiving) return;
    setArchiveLoading(true);
    const res = await archiveMember(archiving.id);
    setArchiveLoading(false);
    setArchiving(null);
    if (res.error) return toast.error(res.error);
    toast.success("Member archived");
    router.refresh();
  }

  const planName = (id: string | null) =>
    plans.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Members</h1>
          <p className="text-sm text-slate-500">{members.length} total members</p>
        </div>
        <Button onClick={openAdd} className="!rounded-xl">
          <Plus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search members"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto min-w-[120px]"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto min-w-[130px]">
              <option value="recent">Newest</option>
              <option value="name">Name A–Z</option>
              <option value="expiry">Expiry</option>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={members.length === 0 ? "No members yet" : "No matches"}
            message={
              members.length === 0
                ? "Add your first member to start tracking health, billing and reports."
                : "Try a different search term or clear the filters."
            }
            action={
              members.length === 0 ? (
                <Button onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add Member
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filtered.map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {initials(m.full_name)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{m.full_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{planName(m.membership_plan_id)}</div>
                      </div>
                    </div>
                    <Badge status={m.status} />
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    {m.whatsapp_number && (
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-3.5 w-3.5 text-slate-400" />
                        {m.whatsapp_number}
                      </div>
                    )}
                    {m.phone_number && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {m.phone_number}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                      <span>Fee</span>
                      <span className="font-medium text-slate-700">₹{Number(m.monthly_fee).toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Expires</span>
                      <span className="font-medium text-slate-700">{formatDate(m.membership_end_date)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => router.push(`/members/${m.id}`)}
                      className="flex-1 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white"
                    >
                      View
                    </button>
                    <button
                      onClick={() => openEdit(m)}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto scroll-x md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Expiry</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                            {initials(m.full_name)}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{m.full_name}</div>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              {m.phone_number && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {m.phone_number}
                                </span>
                              )}
                              {m.whatsapp_number && (
                                <span className="inline-flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {m.whatsapp_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{planName(m.membership_plan_id)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        ₹{Number(m.monthly_fee).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(m.membership_end_date)}</td>
                      <td className="px-4 py-3">
                        <Badge status={m.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => router.push(`/members/${m.id}`)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="View profile"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(m)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setArchiving(m)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Archive"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Member" : "Add Member"}
        wide
      >
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name" error={errors.full_name?.message}>
            <Input {...register("full_name")} placeholder="Rahul Sharma" />
          </Field>
          <Field label="Phone Number">
            <Input {...register("phone_number")} placeholder="+91 98765 43210" />
          </Field>
          <Field label="WhatsApp Number">
            <Input {...register("whatsapp_number")} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Date of Birth">
            <Input type="date" {...register("date_of_birth")} />
          </Field>
          <Field label="Gender">
            <Select {...register("gender")}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Emergency Contact">
            <Input {...register("emergency_contact")} placeholder="Name / phone" />
          </Field>
          <Field label="Joining Date">
            <Input type="date" {...register("joining_date")} />
          </Field>
          <Field label="Membership Plan">
            <Select {...register("membership_plan_id")}>
              <option value="">No plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{Number(p.monthly_fee).toLocaleString("en-IN")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Membership Start">
            <Input type="date" {...register("membership_start_date")} />
          </Field>
          <Field label="Membership End">
            <Input type="date" {...register("membership_end_date")} />
          </Field>
          <Field label="Monthly Fee (₹)" error={errors.monthly_fee?.message}>
            <Input type="number" step="0.01" {...register("monthly_fee")} />
          </Field>
          <Field label="Status">
            <Select {...register("status")}>
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Input {...register("address")} placeholder="Street, city" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea {...register("notes")} placeholder="Injuries, preferences…" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "Save changes" : "Add member"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!archiving}
        title="Archive member?"
        message={`${archiving?.full_name} will be marked inactive. Their history is kept.`}
        confirmLabel="Archive"
        danger
        loading={archiveLoading}
        onConfirm={doArchive}
        onCancel={() => setArchiving(null)}
      />
    </div>
  );
}
