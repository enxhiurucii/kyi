"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { postJSON } from "@/lib/client";
import { isCloudProfile, profileStore, subscribeProfile } from "@/lib/profileStore";
import type { CompanyProfile, FounderProfile, InvestorProfile, NamedRef, ThesisRegion } from "@/lib/profiles/types";
import { SECTOR_KEYWORDS } from "@/lib/similarity";
import { STAGE_LABEL, STAGE_ORDER, type Stage } from "@/lib/types";
import { btn, Card, Chip, cx, field, FitPage, Label } from "@/components/ui";
import CalaImport from "./CalaImport";

const SECTORS = Object.keys(SECTOR_KEYWORDS);
const REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

function sectorLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function chipsToRefs(text: string): NamedRef[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function refsToText(refs: NamedRef[]): string {
  return refs.map((r) => r.name).join(", ");
}

export default function ProfileView() {
  const router = useRouter();
  const { user, verifiedFounder, accountsEnabled, signOut, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [showFounderImport, setShowFounderImport] = useState(false);
  const [showCompanyImport, setShowCompanyImport] = useState(false);
  const [founder, setFounder] = useState(() => profileStore.getFounder());
  const [company, setCompany] = useState(() => profileStore.getCompany());
  const [investor, setInvestor] = useState(() => profileStore.getInvestor());
  const [lists, setLists] = useState(() => profileStore.getLists());
  const [cloud, setCloud] = useState(false);

  const [fullName, setFullName] = useState(founder?.fullName ?? "");
  const [role, setRole] = useState(founder?.role ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(founder?.linkedinUrl ?? "");
  const [location, setLocation] = useState(founder?.location ?? "");
  const [pastCompanies, setPastCompanies] = useState(refsToText(founder?.pastCompanies ?? []));
  const [schools, setSchools] = useState(refsToText(founder?.schools ?? []));

  const [name, setName] = useState(company?.name ?? "");
  const [oneLiner, setOneLiner] = useState(company?.oneLiner ?? "");
  const [stage, setStage] = useState<Stage>(company?.stage ?? "seed");
  const [country, setCountry] = useState(company?.country ?? "");
  const [sectors, setSectors] = useState((company?.sectors ?? []).join(", "));
  const [existingInvestors, setExistingInvestors] = useState(refsToText(company?.existingInvestors ?? []));
  const [discoverable, setDiscoverable] = useState(Boolean(company?.discoverable));

  const [invName, setInvName] = useState(investor?.fullName ?? "");
  const [firmName, setFirmName] = useState(investor?.firmName ?? "");
  const [calaFirmId, setCalaFirmId] = useState(investor?.calaFirmId ?? "");
  const [roleTitle, setRoleTitle] = useState(investor?.roleTitle ?? "");
  const [thesisSectors, setThesisSectors] = useState<string[]>(investor?.thesisSectors ?? []);
  const [thesisStages, setThesisStages] = useState<Stage[]>(investor?.thesisStages ?? []);
  const [thesisRegions, setThesisRegions] = useState<ThesisRegion[]>(investor?.thesisRegions ?? []);
  const [ticketMin, setTicketMin] = useState(investor?.ticketMinEur != null ? String(investor.ticketMinEur) : "");
  const [ticketMax, setTicketMax] = useState(investor?.ticketMaxEur != null ? String(investor.ticketMaxEur) : "");

  function hydrateFromStore() {
    const f = profileStore.getFounder();
    const c = profileStore.getCompany();
    const inv = profileStore.getInvestor();
    setFounder(f);
    setCompany(c);
    setInvestor(inv);
    setLists(profileStore.getLists());
    setCloud(isCloudProfile());
    setFullName(f?.fullName ?? "");
    setRole(f?.role ?? "");
    setLinkedinUrl(f?.linkedinUrl ?? "");
    setLocation(f?.location ?? "");
    setPastCompanies(refsToText(f?.pastCompanies ?? []));
    setSchools(refsToText(f?.schools ?? []));
    setName(c?.name ?? "");
    setOneLiner(c?.oneLiner ?? "");
    setStage(c?.stage ?? "seed");
    setCountry(c?.country ?? "");
    setSectors((c?.sectors ?? []).join(", "));
    setExistingInvestors(refsToText(c?.existingInvestors ?? []));
    setDiscoverable(Boolean(c?.discoverable));
    setInvName(inv?.fullName ?? "");
    setFirmName(inv?.firmName ?? "");
    setCalaFirmId(inv?.calaFirmId ?? "");
    setRoleTitle(inv?.roleTitle ?? "");
    setThesisSectors(inv?.thesisSectors ?? []);
    setThesisStages(inv?.thesisStages ?? []);
    setThesisRegions(inv?.thesisRegions ?? []);
    setTicketMin(inv?.ticketMinEur != null ? String(inv.ticketMinEur) : "");
    setTicketMax(inv?.ticketMaxEur != null ? String(inv.ticketMaxEur) : "");
  }

  useEffect(() => subscribeProfile(hydrateFromStore), []);

  function saveFounder() {
    if (!fullName.trim()) return setMsg("Name is required.");
    const f: FounderProfile = {
      fullName: fullName.trim(),
      role: role.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
      location: location.trim() || undefined,
      pastCompanies: chipsToRefs(pastCompanies),
      schools: chipsToRefs(schools),
      confirmedIdentity: founder?.confirmedIdentity ?? true,
      calaPersonId: founder?.calaPersonId,
      calaSnapshot: founder?.calaSnapshot,
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveFounder(f);
    setFounder(f);
    setMsg(cloud ? "Founder profile saved to your account." : "Founder profile saved on this device.");
  }

  function saveCompany() {
    if (!name.trim() || !oneLiner.trim()) return setMsg("Company name and one-liner are required.");
    const c: CompanyProfile = {
      id: company?.id,
      name: name.trim(),
      oneLiner: oneLiner.trim(),
      stage,
      country: country.trim(),
      sectors: chipsToRefs(sectors).map((r) => r.name.toLowerCase()),
      existingInvestors: chipsToRefs(existingInvestors),
      website: company?.website,
      foundedYear: company?.foundedYear,
      raisingAmountEur: company?.raisingAmountEur,
      calaCompanyId: company?.calaCompanyId,
      calaSnapshot: company?.calaSnapshot,
      discoverable,
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveCompany(c);
    setCompany(c);
    setMsg(cloud ? "Company profile saved to your account." : "Company profile saved on this device.");
  }

  function saveInvestor() {
    if (!invName.trim()) return setMsg("Investor name is required.");
    const inv: InvestorProfile = {
      fullName: invName.trim(),
      firmName: firmName.trim() || undefined,
      calaFirmId: calaFirmId.trim() || undefined,
      roleTitle: roleTitle.trim() || undefined,
      thesisSectors,
      thesisStages,
      thesisRegions,
      ticketMinEur: ticketMin.trim() ? Number(ticketMin) : undefined,
      ticketMaxEur: ticketMax.trim() ? Number(ticketMax) : undefined,
      confirmedFirm: Boolean(calaFirmId.trim()),
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveInvestor(inv);
    setInvestor(inv);
    setMsg(cloud ? "Investor profile saved to your account." : "Investor profile saved on this device.");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(profileStore.exportBundle(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kyi-profile.json";
    a.click();
    URL.revokeObjectURL(url);
    setMsg("Exported kyi-profile.json");
  }

  function onImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result));
        if (!profileStore.importBundle(raw)) {
          setMsg("Import failed — file must be a KYI profile export.");
          return;
        }
        hydrateFromStore();
        setMsg("Imported profile from file.");
      } catch {
        setMsg("Could not read that JSON file.");
      }
    };
    reader.readAsText(file);
  }

  function clearLocal() {
    if (!window.confirm("Delete all KYI data stored on this device?")) return;
    profileStore.clearAll();
    hydrateFromStore();
    setMsg("Local profile cleared.");
  }

  async function deleteAccountData() {
    if (!accountsEnabled || !user) return;
    if (!window.confirm("Delete your founder, company and lists from your account, then sign out?")) return;
    try {
      await postJSON("/api/me/delete", {});
      profileStore.clearAll();
      await signOut();
      await refresh();
      setMsg("Account data deleted.");
      router.push("/");
    } catch (e) {
      setMsg((e as Error).message || "Could not delete account data.");
    }
  }

  if (!founder && !company && !investor) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">No profile yet</h1>
        <p className="mt-2 text-sm text-muted">Set up as a founder or investor, or load a demo persona.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/onboarding" className={btn.primary}>
            Set up profile →
          </Link>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              profileStore.loadDemoProfile();
              hydrateFromStore();
              setMsg("Demo founder (Anna) loaded.");
            }}
          >
            Try as founder (Anna)
          </button>
          <button
            type="button"
            className={btn.secondary}
            onClick={() => {
              profileStore.loadDemoInvestorProfile();
              hydrateFromStore();
              setMsg("Demo investor (Mikko) loaded.");
            }}
          >
            Try as investor (Mikko)
          </button>
        </div>
      </div>
    );
  }

  return (
    <FitPage className="fit:overflow-hidden">
    <div className="mx-auto max-w-3xl space-y-4 fit:h-full fit:min-h-0 fit:overflow-auto fit:fit-scroll sm:px-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            {cloud ? "Your account" : "This device"}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight fit:text-xl">
            Your profile
            {verifiedFounder ? <Chip tone="good">Verified founder ✓</Chip> : null}
          </h1>
        </div>
        <Link href="/onboarding" className={btn.ghost}>
          Re-run onboarding
        </Link>
      </div>

      {msg && (
        <p className="rounded-xl border border-line bg-black/25 px-3 py-2 text-sm text-ink-2">{msg}</p>
      )}

      {(founder || company || profileStore.getRoles().includes("founder")) && (
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Founder</h2>
          <div className="flex items-center gap-2">
            {founder?.confirmedIdentity && <Chip tone="good">{cloud ? "On account" : "Saved locally"}</Chip>}
            <button type="button" className={btn.ghost} onClick={() => setShowFounderImport((v) => !v)}>
              {showFounderImport ? "Hide import" : "Re-import from Cala"}
            </button>
          </div>
        </div>
        {showFounderImport && (
          <CalaImport
            kind="founder"
            queryHint={fullName}
            onApplied={({ founder: partial, facts }) => {
              if (!partial?.fullName) return;
              const f: FounderProfile = {
                fullName: partial.fullName,
                role: partial.role ?? role,
                linkedinUrl: partial.linkedinUrl ?? linkedinUrl,
                location: partial.location ?? location,
                bio: partial.bio,
                pastCompanies: partial.pastCompanies ?? chipsToRefs(pastCompanies),
                schools: partial.schools ?? chipsToRefs(schools),
                calaPersonId: partial.calaPersonId,
                calaSnapshot: facts,
                confirmedIdentity: true,
                updatedAt: new Date().toISOString(),
              };
              profileStore.saveFounder(f);
              hydrateFromStore();
              setShowFounderImport(false);
              setMsg("Founder re-imported.");
            }}
            onManual={() => setShowFounderImport(false)}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Full name</Label>
            <input className={`${field} mt-1.5`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <input className={`${field} mt-1.5`} value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <Label>LinkedIn</Label>
            <input className={`${field} mt-1.5`} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
          </div>
          <div>
            <Label>Location</Label>
            <input className={`${field} mt-1.5`} value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Past companies</Label>
            <input className={`${field} mt-1.5`} value={pastCompanies} onChange={(e) => setPastCompanies(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Schools</Label>
            <input className={`${field} mt-1.5`} value={schools} onChange={(e) => setSchools(e.target.value)} />
          </div>
        </div>
        <button type="button" className={btn.secondary} onClick={saveFounder}>
          Save founder
        </button>
      </Card>
      )}

      {(company || founder || profileStore.getRoles().includes("founder")) && (
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Company</h2>
          <button type="button" className={btn.ghost} onClick={() => setShowCompanyImport((v) => !v)}>
            {showCompanyImport ? "Hide import" : "Re-import from Cala"}
          </button>
        </div>
        {showCompanyImport && (
          <CalaImport
            kind="company"
            queryHint={name}
            onApplied={({ company: partial, facts }) => {
              if (!partial?.name || !partial.oneLiner) return;
              const c: CompanyProfile = {
                id: company?.id,
                name: partial.name,
                oneLiner: partial.oneLiner,
                stage: partial.stage ?? stage,
                country: partial.country ?? country,
                sectors: partial.sectors ?? chipsToRefs(sectors).map((r) => r.name.toLowerCase()),
                website: partial.website,
                foundedYear: partial.foundedYear,
                raisingAmountEur: partial.raisingAmountEur,
                existingInvestors: partial.existingInvestors ?? chipsToRefs(existingInvestors),
                calaCompanyId: partial.calaCompanyId,
                calaSnapshot: facts,
                discoverable,
                updatedAt: new Date().toISOString(),
              };
              profileStore.saveCompany(c);
              hydrateFromStore();
              setShowCompanyImport(false);
              setMsg("Company re-imported.");
            }}
            onManual={() => setShowCompanyImport(false)}
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <input className={`${field} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>One-liner</Label>
            <textarea className={`${field} mt-1.5 min-h-[80px]`} value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
          </div>
          <div>
            <Label>Stage</Label>
            <select className={`${field} mt-1.5`} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Country</Label>
            <input className={`${field} mt-1.5`} value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <div>
            <Label>Sectors</Label>
            <input className={`${field} mt-1.5`} value={sectors} onChange={(e) => setSectors(e.target.value)} />
          </div>
          <div>
            <Label>Existing investors</Label>
            <input className={`${field} mt-1.5`} value={existingInvestors} onChange={(e) => setExistingInvestors(e.target.value)} />
          </div>
          <label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-line bg-black/20 p-3 text-sm text-ink-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
            />
            <span>
              Let matching investors discover my startup{" "}
              <span className="text-muted">(name, one-liner, stage, country, sectors only)</span>
            </span>
          </label>
        </div>
        <button type="button" className={btn.secondary} onClick={saveCompany}>
          Save company
        </button>
      </Card>
      )}

      {(investor || profileStore.getRoles().includes("investor")) && (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Investor</h2>
            {investor?.confirmedFirm ? <Chip tone="good">Firm linked</Chip> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Full name</Label>
              <input className={`${field} mt-1.5`} value={invName} onChange={(e) => setInvName(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <input className={`${field} mt-1.5`} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
            </div>
            <div>
              <Label>Firm</Label>
              <input className={`${field} mt-1.5`} value={firmName} onChange={(e) => setFirmName(e.target.value)} />
            </div>
            <div>
              <Label>Cala firm id</Label>
              <input className={`${field} mt-1.5`} value={calaFirmId} onChange={(e) => setCalaFirmId(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Thesis sectors</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {SECTORS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      thesisSectors.includes(s) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                    )}
                    onClick={() => setThesisSectors((xs) => toggleIn(xs, s))}
                  >
                    {sectorLabel(s)}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Stages</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {STAGE_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      thesisStages.includes(s) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                    )}
                    onClick={() => setThesisStages((xs) => toggleIn(xs, s))}
                  >
                    {STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Regions</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={cx(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      thesisRegions.includes(r) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                    )}
                    onClick={() => setThesisRegions((xs) => toggleIn(xs, r))}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Ticket min €</Label>
              <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMin} onChange={(e) => setTicketMin(e.target.value)} />
            </div>
            <div>
              <Label>Ticket max €</Label>
              <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMax} onChange={(e) => setTicketMax(e.target.value)} />
            </div>
          </div>
          {calaFirmId ? (
            <p className="text-sm">
              <Link href={`/report?inv=${encodeURIComponent(calaFirmId)}`} className="text-accent hover:underline">
                See how founders see your firm →
              </Link>
            </p>
          ) : null}
          <button type="button" className={btn.secondary} onClick={saveInvestor}>
            Save investor
          </button>
        </Card>
      )}

      <Card id="lists" className="scroll-mt-24 space-y-3 p-5">
        <h2 className="text-lg font-semibold">Lists</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-muted">
            No investor lists yet.{" "}
            <Link href="/onboarding" className="text-accent hover:underline">
              Add one in onboarding
            </Link>{" "}
            or from Scout.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {lists.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <span>
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted"> · {l.items.length} investors</span>
                </span>
                <Link href="/raise" className="text-accent hover:underline">
                  Open in Find investors
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold">Backup</h2>
        <p className="text-sm text-muted">Move your profile to another browser or laptop with a JSON file.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} onClick={exportJson}>
            Export my data
          </button>
          <button type="button" className={btn.secondary} onClick={() => fileRef.current?.click()}>
            Import my data
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
          />
          <button type="button" className={btn.ghost} onClick={clearLocal}>
            Delete local copy
          </button>
        </div>
      </Card>

      {accountsEnabled && user ? (
        <Card className="space-y-3 border-bad/30 p-5">
          <h2 className="text-lg font-semibold text-bad">Danger zone</h2>
          <p className="text-sm text-muted">
            Delete founder, company and lists from your account, then sign out. Auth login can remain — you can sign up again.
          </p>
          <button type="button" className={btn.secondary} onClick={() => void deleteAccountData()}>
            Delete my account data
          </button>
        </Card>
      ) : null}
    </div>
    </FitPage>
  );
}
