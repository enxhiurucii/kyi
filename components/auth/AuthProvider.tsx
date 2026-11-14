"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUserSummary, MeResponse } from "@/lib/auth/types";
import { getJSON } from "@/lib/client";
import {
  clearLocalBundle,
  localHasProfile,
  peekLocalBundle,
  switchToCloudProfile,
  switchToLocalProfile,
  uploadLocalToCloud,
} from "@/lib/profileStore";
import { accountsEnabled } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { btn } from "@/components/ui";

type AuthCtx = {
  ready: boolean;
  accountsEnabled: boolean;
  user: AuthUserSummary | null;
  verifiedFounder: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  ready: false,
  accountsEnabled: false,
  user: null,
  verifiedFounder: false,
  refresh: async () => undefined,
  signOut: async () => undefined,
});

export function useAuth() {
  return useContext(Ctx);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const enabled = accountsEnabled();
  const [ready, setReady] = useState(!enabled);
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [verifiedFounder, setVerifiedFounder] = useState(false);
  const [migrateAsk, setMigrateAsk] = useState<{ userId: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const applySession = useCallback(async (uid: string | null, me?: MeResponse) => {
    if (!uid) {
      switchToLocalProfile();
      setUser(null);
      setVerifiedFounder(false);
      return;
    }
    const bundle = await switchToCloudProfile(uid);
    const cloudEmpty = !bundle.founder && !bundle.company && bundle.lists.length === 0;
    if (cloudEmpty && localHasProfile()) {
      setMigrateAsk({ userId: uid });
    }
    if (me?.user) {
      setUser(me.user);
      setVerifiedFounder(me.verifiedFounder);
    } else {
      const fresh = await getJSON<MeResponse>("/api/me");
      setUser(fresh.user);
      setVerifiedFounder(fresh.verifiedFounder);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setReady(true);
      return;
    }
    try {
      const me = await getJSON<MeResponse>("/api/me");
      if (!me.accountsEnabled) {
        setUser(null);
        setVerifiedFounder(false);
        switchToLocalProfile();
        setReady(true);
        return;
      }
      await applySession(me.user?.id ?? null, me);
    } catch {
      setUser(null);
      switchToLocalProfile();
    } finally {
      setReady(true);
    }
  }, [applySession, enabled]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, session: { user?: { id: string } } | null) => {
      if (event === "SIGNED_OUT") {
        switchToLocalProfile();
        setUser(null);
        setVerifiedFounder(false);
        setMigrateAsk(null);
        return;
      }
      if (session?.user?.id) {
        await applySession(session.user.id);
      }
    });
    return () => subscription.unsubscribe();
  }, [applySession, enabled]);

  const signOut = useCallback(async () => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    switchToLocalProfile();
    setUser(null);
    setVerifiedFounder(false);
  }, [enabled]);

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      accountsEnabled: enabled,
      user,
      verifiedFounder,
      refresh,
      signOut,
    }),
    [ready, enabled, user, verifiedFounder, refresh, signOut],
  );

  async function doMigrate(yes: boolean) {
    if (!migrateAsk) return;
    setBusy(true);
    try {
      if (yes) {
        await uploadLocalToCloud(migrateAsk.userId);
      } else {
        // Keep local as-is on device; cloud stays empty until they save.
        peekLocalBundle();
      }
      setMigrateAsk(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {migrateAsk && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="score-panel max-w-md rounded-2xl border border-line p-5 shadow-2xl">
            <h2 className="text-lg font-semibold tracking-tight">Move my profile to my account?</h2>
            <p className="mt-2 text-sm text-muted">
              This browser has a KYI profile. Upload founder, company and lists to your account, then clear the local copy.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className={btn.ghost} disabled={busy} onClick={() => void doMigrate(false)}>
                Keep separate
              </button>
              <button type="button" className={btn.primary} disabled={busy} onClick={() => void doMigrate(true)}>
                {busy ? "Moving…" : "Move to account"}
              </button>
            </div>
            <button
              type="button"
              className="mt-3 text-[11px] text-muted hover:text-ink"
              disabled={busy}
              onClick={() => {
                clearLocalBundle();
                setMigrateAsk(null);
              }}
            >
              Discard local profile
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
