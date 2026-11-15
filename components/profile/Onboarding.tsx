"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getJSON } from "@/lib/client";
import { profileStore } from "@/lib/profileStore";
import type {
  CompanyProfile,
  FounderProfile,
  ImportedFact,
  InvestorProfile,
  NamedRef,
  ThesisRegion,
  UserRole,
} from "@/lib/profiles/types";
import { SECTOR_KEYWORDS } from "@/lib/similarity";
import { STAGE_LABEL, STAGE_ORDER, type DataMode, type Investor, type Stage } from "@/lib/types";
import { SearchPulse } from "@/components/GraphLoading";
import { btn, Card, Chip, cx, field, Label } from "@/components/ui";
import CalaImport from "./CalaImport";

const SECTORS = Object.keys(SECTOR_KEYWORDS);
const REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

function sectorLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
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

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function Onboarding() {
  const router = useRouter();
  const existingF = profileStore.getFounder();
  const existingC = profileStore.getCompany();
  const existingInv = profileStore.getInvestor();
  const existingRoles = profileStore.getRoles();

  const [roles, setRoles] = useState<UserRole[]>(existingRoles);
  const [phase, setPhase] = useState<"roles" | "founder" | "investor">(
    existingRoles.length ? (existingRoles.includes("founder") && !existingF ? "founder" : existingRoles.includes("investor") && !existingInv ? "investor" : "roles") : "roles",
  );
  const [step, setStep] = useState(0);

  const [fullName, setFullName] = useState(existingF?.fullName ?? "");
  const [role, setRole] = useState(existingF?.role ?? "CEO & co-founder");
  const [linkedinUrl, setLinkedinUrl] = useState(existingF?.linkedinUrl ?? "");
  const [location, setLocation] = useState(existingF?.location ?? "");
  const [pastCompanies, setPastCompanies] = useState(refsToText(existingF?.pastCompanies ?? []));
  const [schools, setSchools] = useState(refsToText(existingF?.schools ?? []));

  const [name, setName] = useState(existingC?.name ?? "");
  const [oneLiner, setOneLiner] = useState(existingC?.oneLiner ?? "");
  const [stage, setStage] = useState<Stage>(existingC?.stage ?? "seed");
  const [country, setCountry] = useState(existingC?.country ?? "Finland");
  const [sectors, setSectors] = useState((existingC?.sectors ?? []).join(", "));
  const [website, setWebsite] = useState(existingC?.website ?? "");
  const [existingInvestors, setExistingInvestors] = useState(refsToText(existingC?.existingInvestors ?? []));
  const [discoverable, setDiscoverable] = useState(Boolean(existingC?.discoverable));

  const [listName, setListName] = useState("Slush meetings");
  const [investorsText, setInvestorsText] = useState("");
  const [error, setError] = useState("");
  const [showFounderForm, setShowFounderForm] = useState(Boolean(existingF));
  const [showCompanyForm, setShowCompanyForm] = useState(Boolean(existingC));
  const [calaPersonId, setCalaPersonId] = useState(existingF?.calaPersonId);
  const [calaCompanyId, setCalaCompanyId] = useState(existingC?.calaCompanyId);
  const [importNote, setImportNote] = useState("");
  const [founderFacts, setFounderFacts] = useState<ImportedFact[]>(existingF?.calaSnapshot ?? []);
  const [companyFacts, setCompanyFacts] = useState<ImportedFact[]>(existingC?.calaSnapshot ?? []);

  const [invName, setInvName] = useState(existingInv?.fullName ?? "");
  const [firmName, setFirmName] = useState(existingInv?.firmName ?? "");
  const [calaFirmId, setCalaFirmId] = useState(existingInv?.calaFirmId ?? "");
  const [roleTitle, setRoleTitle] = useState(existingInv?.roleTitle ?? "Partner");
  const [confirmedFirm, setConfirmedFirm] = useState(Boolean(existingInv?.confirmedFirm));
  const [thesisSectors, setThesisSectors] = useState<string[]>(existingInv?.thesisSectors ?? []);
  const [thesisStages, setThesisStages] = useState<Stage[]>(existingInv?.thesisStages ?? ["seed"]);
  const [thesisRegions, setThesisRegions] = useState<ThesisRegion[]>(existingInv?.thesisRegions ?? ["Nordics"]);
  const [ticketMin, setTicketMin] = useState(existingInv?.ticketMinEur != null ? String(existingInv.ticketMinEur) : "500000");
  const [ticketMax, setTicketMax] = useState(existingInv?.ticketMaxEur != null ? String(existingInv.ticketMaxEur) : "3000000");
  const [firmQ, setFirmQ] = useState("");
  const [firmHits, setFirmHits] = useState<Investor[]>([]);
  const [firmSearching, setFirmSearching] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>("demo");

  const founderSteps = useMemo(() => ["You", "Your startup", "Your first list"], []);
  const investorSteps = useMemo(() => ["You & firm", "Thesis"], []);

  useEffect(() => {
    const ac = new AbortController();
    getJSON<{ defaultMode: DataMode }>("/api/health", ac.signal)
      .then((h) => setDataMode(h.defaultMode))
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const term = firmQ.trim();
    if (term.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setFirmSearching(true);
      try {
        const r = await getJSON<{ results: Investor[] }>(
          `/api/investors/search?${new URLSearchParams({ q: term, mode: dataMode })}`,
          ac.signal,
        );
        if (!ac.signal.aborted) setFirmHits(r.results);
      } catch {
        if (!ac.signal.aborted) setFirmHits([]);
      } finally {
        if (!ac.signal.aborted) setFirmSearching(false);
      }
    }, dataMode === "cala" ? 450 : 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [firmQ, dataMode]);

  function applyFounderImport(partial: Partial<FounderProfile>, facts: ImportedFact[]) {
    const f: FounderProfile = {
      fullName: (partial.fullName ?? fullName).trim().slice(0, 120) || "Unknown",
      role: partial.role ?? role,
      linkedinUrl: partial.linkedinUrl,
      location: partial.location ?? location,
      bio: partial.bio,
      pastCompanies: partial.pastCompanies ?? chipsToRefs(pastCompanies),
      schools: partial.schools ?? chipsToRefs(schools),
      calaPersonId: partial.calaPersonId,
      calaSnapshot: facts,
      confirmedIdentity: true,
      updatedAt: new Date().toISOString(),
    };
    setFounderFacts(facts);
    profileStore.saveFounder(f);
    setFullName(f.fullName);
    setRole(f.role ?? "");
    setLinkedinUrl(f.linkedinUrl ?? "");
    setLocation(f.location ?? "");
    setPastCompanies(refsToText(f.pastCompanies));
    setSchools(refsToText(f.schools));
    setCalaPersonId(f.calaPersonId);
    setShowFounderForm(true);
    setImportNote(`Imported ${facts.length} fact${facts.length === 1 ? "" : "s"} from the graph. Review and continue.`);
    setError("");
  }

  function applyCompanyImport(partial: Partial<CompanyProfile>, facts: ImportedFact[]) {
    const c: CompanyProfile = {
      name: (partial.name ?? name).trim().slice(0, 120) || "Unknown",
      oneLiner: (partial.oneLiner ?? oneLiner).trim().slice(0, 600) || "—",
      stage: partial.stage ?? stage,
      country: partial.country ?? country,
      sectors: partial.sectors ?? chipsToRefs(sectors).map((r) => r.name.toLowerCase()),
      website: partial.website ?? website,
      foundedYear: partial.foundedYear,
      raisingAmountEur: partial.raisingAmountEur,
      existingInvestors: partial.existingInvestors ?? chipsToRefs(existingInvestors),
      calaCompanyId: partial.calaCompanyId,
      calaSnapshot: facts,
      discoverable,
      updatedAt: new Date().toISOString(),
    };
    setCompanyFacts(facts);
    profileStore.saveCompany(c);
    setName(c.name);
    setOneLiner(c.oneLiner);
    setStage(c.stage);
    setCountry(c.country);
    setSectors(c.sectors.join(", "));
    setWebsite(c.website ?? "");
    setExistingInvestors(refsToText(c.existingInvestors));
    setCalaCompanyId(c.calaCompanyId);
    setShowCompanyForm(true);
    setImportNote(`Imported ${facts.length} fact${facts.length === 1 ? "" : "s"} from the graph. Review and continue.`);
    setError("");
  }

  function saveFounder(): FounderProfile | null {
    if (!fullName.trim()) {
      setError("Your name is required.");
      return null;
    }
    const f: FounderProfile = {
      fullName: fullName.trim().slice(0, 120),
      role: role.trim().slice(0, 80) || undefined,
      linkedinUrl: linkedinUrl.trim().slice(0, 200) || undefined,
      location: location.trim().slice(0, 120) || undefined,
      pastCompanies: chipsToRefs(pastCompanies).slice(0, 20),
      schools: chipsToRefs(schools).slice(0, 10),
      calaPersonId,
      calaSnapshot: founderFacts.length ? founderFacts : existingF?.calaSnapshot,
      confirmedIdentity: true,
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveFounder(f);
    return f;
  }

  function saveCompany(): CompanyProfile | null {
    if (!name.trim() || !oneLiner.trim()) {
      setError("Company name and one-liner are required.");
      return null;
    }
    const c: CompanyProfile = {
      name: name.trim().slice(0, 120),
      oneLiner: oneLiner.trim().slice(0, 600),
      stage,
      country: country.trim().slice(0, 60),
      sectors: chipsToRefs(sectors).map((r) => r.name.toLowerCase()).slice(0, 12),
      website: website.trim().slice(0, 200) || undefined,
      existingInvestors: chipsToRefs(existingInvestors).slice(0, 30),
      calaCompanyId,
      calaSnapshot: companyFacts.length ? companyFacts : existingC?.calaSnapshot,
      discoverable,
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveCompany(c);
    return c;
  }

  function saveList() {
    const names = investorsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 25);
    const id = crypto.randomUUID();
    profileStore.saveList({
      id,
      name: listName.trim().slice(0, 80) || "Slush meetings",
      createdAt: new Date().toISOString(),
      items: names.map((investorName) => ({
        id: crypto.randomUUID(),
        investorName,
        investorRef: investorName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        dataMode: "demo",
        status: "to_contact" as const,
        updatedAt: new Date().toISOString(),
      })),
    });
    profileStore.setActiveListId(id);
  }

  function saveInvestor(): InvestorProfile | null {
    if (!invName.trim()) {
      setError("Your name is required.");
      return null;
    }
    if (thesisSectors.length === 0) {
      setError("Pick at least one thesis sector.");
      return null;
    }
    const inv: InvestorProfile = {
      fullName: invName.trim().slice(0, 120),
      firmName: firmName.trim().slice(0, 120) || undefined,
      calaFirmId: calaFirmId.trim() || undefined,
      roleTitle: roleTitle.trim().slice(0, 80) || undefined,
      thesisSectors,
      thesisStages,
      thesisRegions,
      ticketMinEur: ticketMin.trim() ? Number(ticketMin) : undefined,
      ticketMaxEur: ticketMax.trim() ? Number(ticketMax) : undefined,
      confirmedFirm: confirmedFirm && Boolean(calaFirmId),
      updatedAt: new Date().toISOString(),
    };
    profileStore.saveInvestor(inv);
    return inv;
  }

  function finishFounder() {
    saveList();
    if (roles.includes("investor") && !profileStore.getInvestor()) {
      setPhase("investor");
      setStep(0);
      setError("");
      return;
    }
    router.push("/raise");
  }

  function finishInvestor() {
    if (!saveInvestor()) return;
    if (roles.includes("founder") && !profileStore.getCompany()) {
      setPhase("founder");
      setStep(0);
      setError("");
      return;
    }
    router.push(roles.includes("founder") && profileStore.getCompany() ? "/raise" : "/invest");
  }

  function nextFounder() {
    setError("");
    setImportNote("");
    if (step === 0) {
      if (!showFounderForm) {
        setShowFounderForm(true);
        setError("Import from Cala or fill in your details to continue.");
        return;
      }
      if (!saveFounder()) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!showCompanyForm) {
        setShowCompanyForm(true);
        setError("Import from Cala or fill in your company to continue.");
        return;
      }
      if (!saveCompany()) return;
      setStep(2);
      return;
    }
    finishFounder();
  }

  function nextInvestor() {
    setError("");
    if (step === 0) {
      if (!invName.trim()) {
        setError("Your name is required.");
        return;
      }
      setStep(1);
      return;
    }
    finishInvestor();
  }

  function startWithRoles() {
    if (roles.length === 0) {
      setError("Pick at least one role.");
      return;
    }
    setError("");
    profileStore.setRoles(roles);
    if (roles.includes("founder")) {
      setPhase("founder");
      setStep(0);
      return;
    }
    setPhase("investor");
    setStep(0);
  }

  if (phase === "roles") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">How do you use KYI?</h1>
        <p className="mt-2 text-sm text-muted">You can be both — we&apos;ll set up each side.</p>

        <Card className="mt-6 space-y-4 p-5 sm:p-6">
          <button
            type="button"
            className={cx(
              "w-full rounded-xl border p-4 text-left transition",
              roles.includes("founder") ? "border-accent bg-accent-soft/30" : "border-line hover:border-white/20",
            )}
            onClick={() => setRoles((r) => toggleIn(r, "founder"))}
          >
            <p className="font-semibold text-ink">I&apos;m a founder</p>
            <p className="mt-1 text-sm text-ink-2">Find &amp; check investors for your raise.</p>
          </button>
          <button
            type="button"
            className={cx(
              "w-full rounded-xl border p-4 text-left transition",
              roles.includes("investor") ? "border-accent bg-accent-soft/30" : "border-line hover:border-white/20",
            )}
            onClick={() => setRoles((r) => toggleIn(r, "investor"))}
          >
            <p className="font-semibold text-ink">I&apos;m an investor</p>
            <p className="mt-1 text-sm text-ink-2">Thesis, market radar, and a company watchlist.</p>
          </button>
          {error && <p className="text-sm text-bad">{error}</p>}
          <button type="button" className={`${btn.primary} w-full justify-center`} onClick={startWithRoles}>
            Continue →
          </button>
        </Card>
      </div>
    );
  }

  if (phase === "investor") {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Investor onboarding</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your firm &amp; thesis</h1>
        <p className="mt-2 text-sm text-muted">Saved to your account when signed in — otherwise on this device.</p>

        <ol className="mt-6 flex gap-2">
          {investorSteps.map((label, i) => (
            <li
              key={label}
              className={cx(
                "flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-medium",
                i === step ? "bg-white text-black" : i < step ? "bg-accent-soft text-accent" : "bg-white/5 text-muted",
              )}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        <Card className="mt-6 space-y-4 p-5 sm:p-6">
          {step === 0 && (
            <>
              <div>
                <Label>Full name *</Label>
                <input className={`${field} mt-1.5`} value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Mikko Virtanen" />
              </div>
              <div>
                <Label>Role</Label>
                <input className={`${field} mt-1.5`} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Partner" />
              </div>
              <div>
                <Label>Firm name</Label>
                <input className={`${field} mt-1.5`} value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Sisu Seed Partners" />
              </div>
              <div>
                <Label>Find my firm in Cala</Label>
                <div className="relative mt-1.5">
                  <input
                    className={field}
                    value={firmQ}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFirmQ(v);
                      if (v.trim().length < 2) setFirmHits([]);
                    }}
                    placeholder="Search investors / firms…"
                  />
                  {firmSearching && <SearchPulse className="absolute right-3 top-3" />}
                </div>
                {firmHits.length > 0 && (
                  <ul className="mt-2 max-h-48 overflow-auto rounded-xl border border-line bg-[#12141c] p-1">
                    {firmHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2"
                          onClick={() => {
                            setFirmName(hit.name);
                            setCalaFirmId(hit.id);
                            setConfirmedFirm(true);
                            setFirmQ("");
                            setFirmHits([]);
                          }}
                        >
                          <div className="text-sm font-medium">{hit.name}</div>
                          {(hit.description || hit.kind) && (
                            <div className="truncate text-xs text-muted">{hit.description ?? hit.kind}</div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {calaFirmId ? (
                  <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmedFirm}
                      onChange={(e) => setConfirmedFirm(e.target.checked)}
                    />
                    <span>
                      I work here — link to <span className="font-medium text-ink">{firmName || calaFirmId}</span>
                      {calaFirmId ? <Chip tone="neutral" className="ml-2">id: {calaFirmId}</Chip> : null}
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-[11px] text-muted">Search and pick your firm, then confirm “I work here”.</p>
                )}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <Label>Thesis sectors *</Label>
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
              <div>
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
              <div>
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Ticket min €</Label>
                  <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMin} onChange={(e) => setTicketMin(e.target.value)} />
                </div>
                <div>
                  <Label>Ticket max €</Label>
                  <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMax} onChange={(e) => setTicketMax(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-bad">{error}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              className={btn.ghost}
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              ← Back
            </button>
            <button type="button" className={btn.primary} onClick={nextInvestor}>
              {step === 1 ? "Save thesis →" : "Continue →"}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Founder onboarding</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Set up KYI for your raise</h1>
      <p className="mt-2 text-sm text-muted">
        Saved to your account when signed in — otherwise on this device. Export a JSON backup from Profile anytime.
      </p>

      <ol className="mt-6 flex gap-2">
        {founderSteps.map((label, i) => (
          <li
            key={label}
            className={cx(
              "flex-1 rounded-full px-2 py-1.5 text-center text-[11px] font-medium",
              i === step ? "bg-white text-black" : i < step ? "bg-accent-soft text-accent" : "bg-white/5 text-muted",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <Card className="mt-6 space-y-4 p-5 sm:p-6">
        {step === 0 && (
          <>
            <CalaImport
              kind="founder"
              queryHint={fullName}
              onApplied={({ founder, facts }) => {
                if (founder) applyFounderImport(founder, facts);
              }}
              onManual={() => setShowFounderForm(true)}
            />
            {importNote && step === 0 ? <p className="text-xs text-accent">{importNote}</p> : null}
            {showFounderForm && (
              <>
                <div>
                  <Label>Full name *</Label>
                  <input className={`${field} mt-1.5`} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Anna Korhonen" />
                </div>
                <div>
                  <Label>Role</Label>
                  <input className={`${field} mt-1.5`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="CEO & co-founder" />
                </div>
                <div>
                  <Label>LinkedIn URL</Label>
                  <input className={`${field} mt-1.5`} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
                </div>
                <div>
                  <Label>City / country</Label>
                  <input className={`${field} mt-1.5`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Helsinki, Finland" />
                </div>
                <div>
                  <Label>Past companies</Label>
                  <input className={`${field} mt-1.5`} value={pastCompanies} onChange={(e) => setPastCompanies(e.target.value)} placeholder="Kuura Cargo, Lastu Robotics" />
                  <p className="mt-1 text-[11px] text-muted">Comma-separated. Used later for warm intros.</p>
                </div>
                <div>
                  <Label>Schools</Label>
                  <input className={`${field} mt-1.5`} value={schools} onChange={(e) => setSchools(e.target.value)} placeholder="Aalto University" />
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <CalaImport
              kind="company"
              queryHint={name}
              onApplied={({ company, facts }) => {
                if (company) applyCompanyImport(company, facts);
              }}
              onManual={() => setShowCompanyForm(true)}
            />
            {importNote && step === 1 ? <p className="text-xs text-accent">{importNote}</p> : null}
            {showCompanyForm && (
              <>
                <div>
                  <Label>Company name *</Label>
                  <input className={`${field} mt-1.5`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lumipolku Logistics" />
                </div>
                <div>
                  <Label>One-liner *</Label>
                  <textarea
                    className={`${field} mt-1.5 min-h-[88px]`}
                    value={oneLiner}
                    onChange={(e) => setOneLiner(e.target.value)}
                    placeholder="What you build and for whom"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Stage *</Label>
                    <select className={`${field} mt-1.5`} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                      {STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {STAGE_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Country *</Label>
                    <input className={`${field} mt-1.5`} value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Sectors</Label>
                  <input className={`${field} mt-1.5`} value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="logistics, AI" />
                </div>
                <div>
                  <Label>Website</Label>
                  <input className={`${field} mt-1.5`} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                </div>
                <div>
                  <Label>Existing investors</Label>
                  <input
                    className={`${field} mt-1.5`}
                    value={existingInvestors}
                    onChange={(e) => setExistingInvestors(e.target.value)}
                    placeholder="Revontuli Angels, Kettu Ventures"
                  />
                  <p className="mt-1 text-[11px] text-muted">They will not be flagged as portfolio conflicts.</p>
                </div>
                <label className="flex items-start gap-2 rounded-xl border border-line bg-black/20 p-3 text-sm text-ink-2">
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
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <Label>List name</Label>
              <input className={`${field} mt-1.5`} value={listName} onChange={(e) => setListName(e.target.value)} />
            </div>
            <div>
              <Label>Investors you are meeting</Label>
              <textarea
                className={`${field} mt-1.5 min-h-[160px] font-mono text-xs`}
                value={investorsText}
                onChange={(e) => setInvestorsText(e.target.value)}
                placeholder={"One per line\nSisu Seed Partners\nLifeline Ventures"}
              />
            </div>
          </>
        )}

        {error && <p className="text-sm text-bad">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button type="button" className={btn.ghost} disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            ← Back
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button
                type="button"
                className={btn.secondary}
                onClick={() => {
                  setError("");
                  if (!saveCompany() && !profileStore.getCompany()) return;
                  if (roles.includes("investor") && !profileStore.getInvestor()) {
                    setPhase("investor");
                    setStep(0);
                    return;
                  }
                  router.push("/raise");
                }}
              >
                Skip for now
              </button>
            )}
            <button type="button" className={btn.primary} onClick={nextFounder}>
              {step === 2 ? "Open shortlist →" : "Continue →"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
