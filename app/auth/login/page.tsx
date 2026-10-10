"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/button";
import { Input, Field } from "@/components/input";
import { Dumbbell, Mail, Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    if (resetMode) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/update-password`,
      });
      setLoading(false);
      if (error) return toast.error(error.message);
      return toast.success("Password reset email sent (check your inbox).");
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      if (error.message.includes("Invalid login"))
        return toast.error("Invalid email or password.");
      return toast.error(error.message);
    }
    toast.success("Welcome back!");
    router.push(params.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@fitgym.local"
            className="pl-9"
          />
        </div>
      </Field>
      {!resetMode && (
        <Field label="Password">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-9"
            />
          </div>
        </Field>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        {resetMode ? "Send reset email" : "Sign in"}
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setResetMode(!resetMode)}
          className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {resetMode ? "Back to login" : "Forgot password?"}
        </button>
        <span className="text-slate-400">Admin access only</span>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">FitGym Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to manage your gym
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
