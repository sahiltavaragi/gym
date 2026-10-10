"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/button";
import { Input, Field } from "@/components/input";
import { toast } from "sonner";
import { Dumbbell } from "lucide-react";

function UpdateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated!");
    const next = params.get("next");
    router.push(next || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="New password" hint="Minimum 8 characters">
        <Input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

export default function UpdatePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Set new password</h1>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense>
            <UpdateForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
