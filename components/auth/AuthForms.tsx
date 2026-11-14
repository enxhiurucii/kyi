"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { accountsEnabled } from "@/lib/supabase/config";
import { useAuth } from "./AuthProvider";
import { btn, Card, field, Label } from "@/components/ui";

function Disabled() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Continue without an account</h1>
      <p className="mt-2 text-sm text-muted">
        Demo mode works offline on this device. Sign-in is optional and only available when accounts are configured.
      </p>
      <Link href="/" className={`${btn.primary} mt-6`}>
        ← Back to KYI
      </Link>
    </div>
  );
}

export function SignUpView() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (!accountsEnabled()) return <Disabled />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError("Name, email and a password (6+ chars) are required.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (err) throw err;
      if (data.session) {
        await refresh();
        router.push("/onboarding");
        return;
      }
      setInfo("Check your email to confirm, then sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your KYI account" subtitle="Save your founder profile and investor lists across devices.">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <Label>Full name</Label>
          <input className={`${field} mt-1.5`} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
        </div>
        <div>
          <Label>Email</Label>
          <input className={`${field} mt-1.5`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <Label>Password</Label>
          <input
            className={`${field} mt-1.5`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        {info && <p className="text-sm text-good">{info}</p>}
        <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </button>
      </form>
      <GuestAndLinks mode="signup" />
    </AuthShell>
  );
}

export function SignInView() {
  const router = useRouter();
  const search = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(search.get("error") === "auth" ? "Could not complete sign-in. Try again." : "");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  if (!accountsEnabled()) return <Disabled />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (forgot) {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
        });
        if (err) throw err;
        setInfo("Password reset email sent — check your inbox.");
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) throw err;
      await refresh();
      router.push("/raise");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={forgot ? "Reset password" : "Sign in"}
      subtitle={forgot ? "We’ll email you a link to set a new password." : "Welcome back — your cloud profile will load."}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <Label>Email</Label>
          <input className={`${field} mt-1.5`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        {!forgot && (
          <div>
            <Label>Password</Label>
            <input
              className={`${field} mt-1.5`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
        {info && <p className="text-sm text-good">{info}</p>}
        <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>
          {busy ? "…" : forgot ? "Send reset link" : "Sign in"}
        </button>
      </form>
      <button type="button" className={`${btn.ghost} mt-3`} onClick={() => { setForgot((v) => !v); setError(""); setInfo(""); }}>
        {forgot ? "Back to sign in" : "Forgot password"}
      </button>
      <GuestAndLinks mode="signin" />
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Account</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
      <Card className="mt-8 space-y-4 p-5 sm:p-6">{children}</Card>
    </div>
  );
}

function GuestAndLinks({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function guest() {
    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.signInAnonymously();
      if (err) throw err;
      await refresh();
      router.push("/onboarding");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Guest sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <button type="button" className={`${btn.secondary} w-full`} disabled={busy} onClick={() => void guest()}>
        {busy ? "…" : "Continue as guest"}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
      <p className="text-center text-sm text-muted">
        {mode === "signin" ? (
          <>
            No account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/signin" className="text-accent hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
      <p className="text-center text-sm">
        <Link href="/" className="text-muted hover:text-ink">
          ← Back
        </Link>
      </p>
    </div>
  );
}
