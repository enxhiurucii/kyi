"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { postJSON } from "@/lib/client";
import {
  demoInvestorUserId,
  expressLocalInterest,
  hasLocalInterest,
  isDemoLumipolku,
  subscribeInterests,
} from "@/lib/interests/localStore";
import type { InterestRecord } from "@/lib/interests/types";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import type { Stage } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import { btn, Chip, cx, field } from "./ui";

type Props = {
  companyName: string;
  companyId?: string;
  stage: Stage;
  dataMode: "demo" | "cala";
  className?: string;
};

export function OnKyiBadge({ stage }: { stage: Stage }) {
  return (
    <Chip tone="good">
      On KYI · raising {STAGE_LABEL[stage] ?? stage}
    </Chip>
  );
}

export function isDiscoverableOnKyi(companyName: string, dataMode: "demo" | "cala"): { stage: Stage } | null {
  const c = profileStore.getCompany();
  if (c?.discoverable && c.name.trim().toLowerCase() === companyName.trim().toLowerCase()) {
    return { stage: c.stage };
  }
  if (dataMode === "demo" && isDemoLumipolku(companyName)) {
    const stage = c?.discoverable && isDemoLumipolku(c.name) ? c.stage : "seed";
    return { stage };
  }
  return null;
}

export default function ExpressInterest({ companyName, companyId, stage, dataMode, className }: Props) {
  const { user, accountsEnabled } = useAuth();
  const [investorOk, setInvestorOk] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function sync() {
      const inv = profileStore.getInvestor();
      const co = profileStore.getCompany();
      setInvestorOk(Boolean(inv));
      setIsOwner(Boolean(co?.name && co.name.trim().toLowerCase() === companyName.trim().toLowerCase()));
      const uid = user?.id ?? (inv ? demoInvestorUserId() : "");
      if (uid && hasLocalInterest(uid, companyName, companyId)) setDone(true);
    }
    sync();
    return subscribeProfile(sync);
  }, [companyName, companyId, user?.id]);

  useEffect(() => subscribeInterests(() => {
    const inv = profileStore.getInvestor();
    const uid = user?.id ?? (inv ? demoInvestorUserId() : "");
    if (uid && hasLocalInterest(uid, companyName, companyId)) setDone(true);
  }), [companyName, companyId, user?.id]);

  if (!investorOk || isOwner) return null;

  async function submit() {
    setBusy(true);
    setError("");
    const inv = profileStore.getInvestor();
    if (!inv) {
      setError("Load an investor profile first.");
      setBusy(false);
      return;
    }
    try {
      const uid = user?.id ?? demoInvestorUserId();
      // Always persist locally so demo persona switch works without Supabase.
      expressLocalInterest({
        companyId: companyId || (dataMode === "demo" && isDemoLumipolku(companyName) ? "demo-company-lumipolku" : undefined),
        companyName,
        companyStage: stage,
        investorUserId: uid,
        investorName: inv.fullName,
        investorFirm: inv.firmName || "Investor",
        message,
      });

      if (accountsEnabled && user) {
        try {
          await postJSON<{ interest: InterestRecord }>("/api/interests", {
            companyId,
            companyName,
            companyStage: stage,
            message: message || undefined,
            mode: dataMode,
          });
        } catch (e) {
          // Local demo still succeeded; surface cloud error softly.
          if (dataMode === "cala") throw e;
        }
      } else {
        await postJSON("/api/interests", {
          companyId,
          companyName,
          companyStage: stage,
          message: message || undefined,
          mode: "demo",
        }).catch(() => undefined);
      }

      setDone(true);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || "Could not express interest.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <span className={cx("text-xs font-medium text-good", className)}>Interest sent</span>
    );
  }

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      {!open ? (
        <button type="button" data-testid="express-interest" className={btn.primary} onClick={() => setOpen(true)}>
          Express interest
        </button>
      ) : (
        <div className="rounded-xl border border-line bg-black/25 p-3">
          <label className="block text-xs text-muted">
            Optional note
            <textarea
              className={`${field} mt-1 min-h-[64px] text-sm`}
              maxLength={500}
              placeholder="Short note to the founder…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={btn.primary} disabled={busy} onClick={() => void submit()}>
              {busy ? "Sending…" : "Send interest"}
            </button>
            <button type="button" className={btn.ghost} disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
        </div>
      )}
    </div>
  );
}
