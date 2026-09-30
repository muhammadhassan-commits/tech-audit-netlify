# Initial Technical SEO + LLM Visibility Audit — published viewer

This is the **publishable half** of the audit tool. It is a static site: HTML, CSS, one script and
some JSON. It shows finished audit reports — the overall score, every factor's verdict, the pages
sampled, the evidence, and the registered source behind each finding.

It does **not** run audits. That happens in the engine, on your machine.

```
  ENGINE  (local, long-running)            VIEWER  (this project, published)
  ────────────────────────────             ────────────────────────────────
  crawls the site                          reads data/reports/*.json
  renders pages in a browser        →      reads data/register.json
  calls PageSpeed Insights / CrUX          no server, no API keys, no timeouts
  calls the Section 6 rubric
  writes runs/<name>.json
```

## Why the split

Netlify cannot host the engine, and this is not a configuration problem:

| What the engine needs | What Netlify gives a function |
| --- | --- |
| 424–581 s per audit (measured on real runs) | 10 s default, 26 s maximum |
| a Chromium binary for the RENDERED profile | no browser in the runtime |
| a writable disk for `runs/` | read-only filesystem |
| a held-open `text/event-stream` for progress | no persistent connections |

So the engine stays local and the **reports** get published. That also means no API key ever
reaches the published site — see *Secrets* below.

## Publish a report

```bash
cd C:\Users\hassan.baig\Techinical-audit-2
npm run audit -- example.com --json runs/example-com.json
```

Then build and publish:

```bash
cd C:\Users\hassan.baig\technical-audit-local-V2-netlify
npm run build
npm run preview   # http://localhost:4321 — serves public/ exactly as Netlify will
```

> **Windows / PowerShell.** If `npm` fails with *"running scripts is disabled on this system"*,
> PowerShell is refusing to run `npm.ps1` under the default `Restricted` execution policy. Call the
> `.cmd` shims instead — they do not go through PowerShell at all, and nothing has to be changed:
>
> ```powershell
> npm.cmd run build
> npx.cmd netlify deploy --prod --dir public
> ```
>
> `node scripts/build.mjs` also works directly. If you would rather fix it once for your account,
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in an ordinary PowerShell window does it —
> that is a change to your machine's script-execution policy, so make it deliberately.

`npm run build` does two things:

1. **Resolves the register.** It loads the same source `.xlsx` the engine reads and resolves every
   checkpoint's citation into `public/data/register.json`. The Reference button then works with no
   backend, and it shows what the register says *now*, not what it said when the audit ran.
2. **Copies the reports.** Every `runs/*.json` is copied into `public/data/reports/` with a sorted
   manifest at `public/data/reports.json`, which is what the report list reads.

Point it at a different engine folder with `AUDIT_TOOL_DIR`:

```bash
AUDIT_TOOL_DIR=/path/to/engine npm run build
```

### Stale reports are refused

A report records the engine version that produced it. If that version is not the engine's current
`TOOL_VERSION`, the build **refuses to publish it** and says which file and which version:

```
  1 report(s) were produced by an older engine:
    peec-ai.json — v1.1.0, engine is now v1.2.0
  They were NOT published. Re-run those audits, or set ALLOW_STALE=1 to publish them as they are.
```

This exists because it already bit us: a report carried a `BLOCKED` verdict from before the fix that
splits `BLOCKED` (could not crawl) from `CRITICAL_ISSUES` (crawled fine, critical problem found).
Re-run the audit, or publish deliberately with `ALLOW_STALE=1`.

## Deploy

Connect the repository to Netlify and accept the settings in `netlify.toml` — build `npm run build`,
publish `public`, Node 20. Or from the CLI:

```bash
npx netlify deploy --prod      # PowerShell: npx.cmd netlify deploy --prod
```

`public/data/` is generated, so it is gitignored. The build regenerates it on Netlify, which means
**the engine folder must be reachable from the build**. Two ways to arrange that:

- **Build locally, deploy the output.** `npm run build`, then `npx netlify deploy --prod --dir public`.
  Simplest, and the only option if the engine is not in the same repository.
  (PowerShell: `npm.cmd run build`, then `npx.cmd netlify deploy --prod --dir public`.)
- **Commit the data.** Drop `public/data/` from `.gitignore` and commit the generated JSON. The
  reports become part of the repository history — fine for a handful, heavy over time (~1.5 MB each).

## Secrets

**The published site needs no API keys**, and the build never writes one into `public/`. Keys live in
the *engine's* `.env`, which is gitignored there:

| Key | What it unlocks | Where it belongs |
| --- | --- | --- |
| `GOOGLE_API_KEY` | C-4.1 Core Web Vitals (CrUX, PageSpeed Insights) | engine `.env` |
| `ANTHROPIC_API_KEY` | Section 6 rubric (C-6.2 – C-6.5) | engine `.env` |
| `CLORO_API_KEY` | nothing yet; no check reads it | engine `.env` |

Nothing in `public/` calls an external service at runtime, so there is nothing for a key to unlock
and nothing to leak. Run the check yourself before any deploy:

```bash
grep -rEi 'AIzaSy|sk-ant-|sk_live_|[?&]key=' public/ || echo "clean"
```

If a key has ever been pasted into a chat, a terminal that is being recorded, or a commit, treat it
as public and rotate it — that is cheap and the alternative is not.

## What a visitor can do

- See every published report, newest first, with its verdict and score.
- Open one: overall score, error distribution by severity / section / reason code, the six section
  scores with their weights, the pages sampled and why each was chosen, and every factor's findings.
- Hover **Reference** on any factor or finding for the registered source — publisher, tier, title,
  URL, and what that source actually establishes. Where a threshold is this tool's own policy rather
  than a documented search-engine requirement, the popover says so.
- **Print / save as PDF**, or **Download JSON** for the raw report.
- Share a direct link to one report: `https://<site>/#run=<report-id>`.

## Layout

```
netlify.toml            build, redirect and cache headers
package.json            npm run build · npm run preview
scripts/build.mjs       resolves the register, copies the reports, refuses stale ones
scripts/serve.mjs       local static preview, mirrors Netlify's behaviour
public/index.html       the page
public/app.js           rendering; reads only static JSON
public/app.css          styles, including the print stylesheet
public/data/            GENERATED by npm run build — not in git
```
