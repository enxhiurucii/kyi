import type { CompanyProfile } from "../profiles/types";

/** Email domain matches company website domain → verified founder. */
export function isVerifiedFounder(email: string | null | undefined, company: CompanyProfile | null): boolean {
  if (!email || !company?.website) return false;
  const at = email.indexOf("@");
  if (at < 0) return false;
  const mailDomain = email
    .slice(at + 1)
    .toLowerCase()
    .replace(/^www\./, "");
  try {
    const host = new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return Boolean(mailDomain && host && (host === mailDomain || host.endsWith(`.${mailDomain}`) || mailDomain.endsWith(`.${host}`)));
  } catch {
    return false;
  }
}
