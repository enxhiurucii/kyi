/**
 * Assert one-screen fit layouts (no page scroll on desktop).
 * Requires: npm run dev on http://localhost:3000
 * Run: npx tsx scripts/check-fit.ts
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.KYI_BASE ?? "http://localhost:3000";
const OUT = join(process.cwd(), "docs", "fit");

const DESKTOP = [
  { w: 1920, h: 1080 },
  { w: 1440, h: 900 },
] as const;

const PAGES: { name: string; path: string; selector: string; waitMs?: number }[] = [
  { name: "landing", path: "/", selector: "h1" },
  { name: "raise", path: "/raise?demo=1&mode=demo", selector: '[data-testid="shortlist-first"]', waitMs: 25000 },
  {
    name: "report",
    path: "/report?inv=aurora-peak-capital&d=AI%20route%20planning%20for%20trucking%20fleets&s=seed&c=Finland&mode=demo",
    selector: '[data-testid="report-tiles"], [data-testid="report-header"]',
    waitMs: 15000,
  },
  {
    name: "compare",
    path: "/compare?ids=sisu-seed-partners|aurora-peak-capital&d=AI%20route%20planning%20for%20trucking%20fleets&s=seed&c=Finland&mode=demo",
    selector: "table",
    waitMs: 20000,
  },
  { name: "invest", path: "/invest?demo=1&mode=demo", selector: "h1" },
  {
    name: "market",
    path: "/market?mode=demo&demo=1&sectors=logistics,mobility&stages=pre-seed,seed&regions=Nordics,Baltics&tmin=500000&tmax=3000000",
    selector: '[data-testid="watch-first"], h2',
    waitMs: 12000,
  },
  { name: "scout-founder", path: "/scout?for=founder&demo=1&mode=demo", selector: "#scout-plan, [aria-live]", waitMs: 20000 },
];

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function noPageScroll(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const sh = Math.max(de.scrollHeight, body.scrollHeight);
    const sw = Math.max(de.scrollWidth, body.scrollWidth);
    return {
      okH: sh <= window.innerHeight + 1,
      okW: sw <= window.innerWidth + 1,
      sh,
      sw,
      ih: window.innerHeight,
      iw: window.innerWidth,
    };
  });
}

async function inViewport(page: Page, selector: string) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return { ok: false, reason: `missing ${selector}` };
  const box = await loc.boundingBox();
  if (!box) return { ok: false, reason: "no box" };
  const vp = page.viewportSize()!;
  const fully =
    box.x >= -1 &&
    box.y >= -1 &&
    box.x + box.width <= vp.width + 1 &&
    box.y + box.height <= vp.height + 1;
  return { ok: fully, reason: fully ? "" : `box=${JSON.stringify(box)} vp=${vp.width}x${vp.height}` };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: string[] = [];

  try {
    for (const vp of DESKTOP) {
      for (const present of [false, true]) {
        for (const p of PAGES) {
          const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
          const page = await context.newPage();
          const url = `${BASE}${p.path}${p.path.includes("?") ? "&" : "?"}present=${present ? "1" : "0"}`;
          const label = `${p.name}@${vp.w}${present ? "+present" : ""}`;
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
            if (p.waitMs) await page.waitForTimeout(p.waitMs);
            // wait for key selector if possible
            try {
              await page.waitForSelector(p.selector, { timeout: Math.min(p.waitMs ?? 8000, 15000) });
            } catch {
              /* continue — assert below */
            }
            const scroll = await noPageScroll(page);
            if (!scroll.okH || !scroll.okW) {
              fail(`${label}: page scroll sh=${scroll.sh}/${scroll.ih} sw=${scroll.sw}/${scroll.iw}`);
            }
            const key = await inViewport(page, p.selector);
            if (!key.ok) fail(`${label}: key element not in viewport (${key.reason})`);
            const shot = join(OUT, `${p.name}-${vp.w}${present ? "-present" : ""}.png`);
            await page.screenshot({ path: shot, fullPage: false });
            results.push(`OK ${label}`);
            console.log(`OK ${label}`);
          } finally {
            await context.close();
          }
        }
      }
    }

    // Phone: may scroll vertically, must not scroll horizontally
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.goto(`${BASE}/raise?mode=demo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(1500);
      const scroll = await page.evaluate(() => {
        const de = document.documentElement;
        return { sw: Math.max(de.scrollWidth, document.body.scrollWidth), iw: window.innerWidth };
      });
      if (scroll.sw > scroll.iw + 1) fail(`phone: horizontal scroll sw=${scroll.sw} iw=${scroll.iw}`);
      await page.screenshot({ path: join(OUT, "raise-390.png"), fullPage: false });
      results.push("OK phone-390 no-hscroll");
      console.log("OK phone-390 no-hscroll");
      await context.close();
    }

    // Company page: open first watch from market in demo
    {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();
      await page.goto(
        `${BASE}/market?mode=demo&sectors=logistics,mobility&stages=pre-seed,seed&regions=Nordics,Baltics`,
        { waitUntil: "domcontentloaded", timeout: 60000 },
      );
      await page.waitForTimeout(8000);
      const href = await page.evaluate(() => {
        const a = document.querySelector('a[href*="/company"]') as HTMLAnchorElement | null;
        return a?.href ?? null;
      });
      if (href) {
        await page.goto(href.includes("?") ? `${href}&mode=demo` : `${href}?mode=demo`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await page.waitForTimeout(8000);
        const scroll = await noPageScroll(page);
        if (!scroll.okH || !scroll.okW) fail(`company@1920: page scroll`);
        await page.screenshot({ path: join(OUT, "company-1920.png"), fullPage: false });
        results.push("OK company@1920");
        console.log("OK company@1920");
      } else {
        console.log("SKIP company (no /company link on market)");
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nPassed ${results.length} checks. Screenshots in docs/fit/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
