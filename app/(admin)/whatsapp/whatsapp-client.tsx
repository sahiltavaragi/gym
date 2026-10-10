"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Send, RefreshCw, MessageCircle, Copy, CheckCircle2, XCircle } from "lucide-react";
import type { GymSettings, WhatsAppMessage } from "@/lib/types";
import {
  prepareMonthlyBundle,
  sendWhatsApp,
  updateMessageStatus,
} from "@/lib/actions/whatsapp";
import { Badge } from "@/components/badge";
import { Card, CardHeader } from "@/components/card";
import { Button } from "@/components/button";
import { Input, Select, Field, Textarea } from "@/components/input";
import { EmptyState } from "@/components/skeleton";
import { monthKey, monthLabel, formatDate } from "@/lib/utils";

type MemberLite = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
  status: string;
};

type MessageRow = WhatsAppMessage & { member?: { id: string; full_name: string } | null };

export function WhatsAppClient({
  members,
  messages,
  settings,
}: {
  members: MemberLite[];
  messages: MessageRow[];
  settings: GymSettings | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [memberId, setMemberId] = useState(params.get("member") ?? "");
  const [month, setMonth] = useState(monthKey());
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [bundle, setBundle] = useState<{
    reportId?: string;
    invoiceId?: string;
    reportLink?: string;
    message?: string;
    error?: string;
  } | null>(null);
  const [body, setBody] = useState("");
  const [phone, setPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const selectedMember = members.find((x) => x.id === memberId) ?? null;

  async function prepare() {
    if (!memberId) return toast.error("Select a member");
    setPreparing(true);
    const res = await prepareMonthlyBundle(memberId, month);
    setPreparing(false);
    if (res.error) return toast.error(res.error);
    setBundle(res);
    setBody(res.message ?? "");
    const selected = members.find((x) => x.id === memberId);
    if (selected) setPhone(selected.whatsapp_number ?? "");
    toast.success("Monthly bundle ready — review the message below");
    router.refresh();
  }

  async function send() {
    if (!memberId) return;
    if (!phone) return toast.error("Member has no WhatsApp number saved");
    setSending(true);
    const res = await sendWhatsApp({
      member_id: memberId,
      invoice_id: bundle?.invoiceId ?? null,
      health_report_id: bundle?.reportId ?? null,
      phone,
      body,
      report_link: bundle?.reportLink ?? null,
      status: "sent",
    });
    setSending(false);
    if (res.error) return toast.error(res.error);
    toast.success("Message logged as sent");
    // offer to open WhatsApp Web with the text pre-filled
    const waUrl = `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(body)}`;
    window.open(waUrl, "_blank", "noopener");
    router.refresh();
  }

  async function mark(id: string, status: "delivered" | "failed") {
    const res = await updateMessageStatus(id, status);
    if (res.error) return toast.error(res.error);
    toast.success(`Marked ${status}`);
    router.refresh();
  }

  async function copyText() {
    await navigator.clipboard.writeText(body);
    toast.success("Message copied");
  }

  const filtered = statusFilter
    ? messages.filter((m) => m.status === statusFilter)
    : messages;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">WhatsApp</h1>
          <p className="text-sm text-slate-500">
            Generate, preview and send monthly reports — credentials stay server-side
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Generator */}
        <Card>
          <CardHeader
            title="Generate & Send Monthly Report"
            subtitle="Report + bill + secure links + message in one step"
          />
          <div className="space-y-4 p-5">
            <Field label="Member">
              <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Select member…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} {m.whatsapp_number ? "" : "(no WhatsApp)"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Month">
              <Input
                type="month"
                value={month.slice(0, 7)}
                onChange={(e) => setMonth(e.target.value + "-01")}
              />
            </Field>
            <Button onClick={prepare} loading={preparing} className="w-full">
              <RefreshCw className="h-4 w-4" /> Generate Bundle
            </Button>

            {bundle && !bundle.error && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Preview
                    </span>
                    <button
                      onClick={copyText}
                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-64 bg-white font-mono text-xs"
                  />
                </div>

                <Field label="WhatsApp Number">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
                </Field>

                <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
                  ✓ Health report generated · ✓ Bill created (no duplicates) · ✓ Secure links
                  embedded
                </div>

                <div className="flex gap-2">
                  {bundle.reportLink && (
                    <a
                      href={bundle.reportLink}
                      target="_blank"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Test Report Link
                    </a>
                  )}
                  <Button onClick={send} loading={sending} className="flex-1">
                    <Send className="h-4 w-4" /> Send / Open WhatsApp
                  </Button>
                </div>
              </>
            )}

            {bundle?.error && (
              <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-600">{bundle.error}</div>
            )}
          </div>
        </Card>

        {/* Message log */}
        <Card>
          <CardHeader
            title="Message History"
            action={
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto text-xs"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="failed">Failed</option>
              </Select>
            }
          />
          {filtered.length === 0 ? (
            <EmptyState
              title="No messages yet"
              message="Messages you send appear here with their delivery status."
            />
          ) : (
            <div className="max-h-[560px] divide-y divide-slate-50 overflow-y-auto">
              {filtered.map((m) => (
                <div key={m.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {m.member?.full_name ?? "—"}
                      </span>
                      <span className="text-xs text-slate-400">{m.phone}</span>
                    </div>
                    <Badge status={m.status} />
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-slate-500">
                    {m.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {formatDate(m.created_at)} · {m.provider}
                    </span>
                    <div className="flex gap-1">
                      {m.status !== "delivered" && (
                        <button
                          onClick={() => mark(m.id, "delivered")}
                          className="rounded p-1 text-emerald-500 hover:bg-emerald-50"
                          title="Mark delivered"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {m.status !== "failed" && (
                        <button
                          onClick={() => mark(m.id, "failed")}
                          className="rounded p-1 text-rose-400 hover:bg-rose-50"
                          title="Mark failed"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
