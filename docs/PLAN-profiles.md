# KYI profiles plan (localStorage — no Supabase)

## Change from original plan
- **No Supabase, login, proxy, or database.**
- Profiles + lists live in the browser via `lib/profileStore.ts` (`ProfileStore` interface).
- APIs that need context receive `founder` / `company` in the request body.
- **Load demo profile** seeds Anna + Lumipolku Logistics + Slush meetings list.

## Phase order
1. **Done:** profileStore + onboarding (manual) + `/profile` + home prefill + skip own company in conflicts + export/import JSON
2. **Done:** Import from Cala — `lib/providers/cala-profiles.ts`, `demo-profiles.ts`, `/api/profiles/search-*` + `import-*`, CalaImport UI (confirm → profileStore)
3. Saved lists UI (`/lists`, Save to list, CSV)
4. Warm intro paths
5. Polish + demo script

Quality gate after every phase: `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
