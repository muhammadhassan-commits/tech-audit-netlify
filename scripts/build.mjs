// Build step. Two different jobs, chosen by whether the audit engine is reachable:
//
//   ENGINE PRESENT (your machine)  — regenerate public/data from it:
//       1. the source register (.xlsx), resolved once so the Reference popover needs no backend
//       2. the report JSONs in runs/, copied in with a manifest the start screen reads
//
//   ENGINE ABSENT (Netlify, CI)    — verify the committed public/data and publish it as-is.
//
// The engine is not part of this repository and Netlify cannot reach it, so demanding it there
// would fail every deploy. public/data is committed precisely so it does not have to be there.
// Either way the secret scan runs before anything is published.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'public', 'data');
const REGISTER_FILE = path.join(OUT, 'register.json');
const MANIFEST_FILE = path.join(OUT, 'reports.json');
const REPORTS_OUT = path.join(OUT, 'reports');

// The engine lives next door. Override with AUDIT_TOOL_DIR when it sits elsewhere.
const TOOL = process.env.AUDIT_TOOL_DIR || path.resolve(ROOT, '..', 'Techinical-audit-2');

function fail(message, hint) {
  console.error(`\n  Build failed: ${message}`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

/** Rebuild public/data from the engine next door. */
async function regenerate() {
  // ── 1. Resolve the register ─────────────────────────────────────────────
  // Every finding's citation is resolved at build time, so the viewer ships the answers rather
  // than the logic. The same register file the engine reads is the one baked in here.
  // Windows paths need a file:// URL before dynamic import will take them.
  const toolUrl = (...parts) => path.join(TOOL, ...parts).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:');
  const { getRegister } = await import(toolUrl('src', 'sources', 'register.js'));
  const { CHECKPOINTS } = await import(toolUrl('src', 'engine', 'result.js'));
  const { TOOL_VERSION } = await import(toolUrl('src', 'config.js'));

  const reg = getRegister();
  const resolved = {};
  for (const [id, cp] of Object.entries(CHECKPOINTS)) {
    const r = reg.resolve(cp.check_id, { checkpoint: id, reasonCode: cp.reason_code });
    resolved[`${cp.check_id}|${id}|${cp.reason_code || ''}`] = r;
  }
  // Factor-level entries, for the Reference button on a factor header.
  for (const checkId of reg.factors.keys()) {
    resolved[`${checkId}||`] = reg.resolve(checkId, {});
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(REGISTER_FILE, JSON.stringify({
    file: path.basename(reg.filePath),
    built_at: new Date().toISOString(),
    resolved,
  }));
  console.log(`  register:  ${Object.keys(resolved).length} resolved citations from ${reg.sources.size} sources`);

  // ── 2. Copy the reports ─────────────────────────────────────────────────
  const runsDir = path.join(TOOL, 'runs');
  fs.mkdirSync(REPORTS_OUT, { recursive: true });
  for (const f of fs.readdirSync(REPORTS_OUT)) fs.rmSync(path.join(REPORTS_OUT, f));

  const manifest = [];
  const stale = [];
  // Publishing a stale report is a deliberate act, so it takes an explicit flag.
  const ALLOW_STALE = process.env.ALLOW_STALE === '1';
  if (fs.existsSync(runsDir)) {
    for (const file of fs.readdirSync(runsDir).filter((f) => f.endsWith('.json'))) {
      const raw = fs.readFileSync(path.join(runsDir, file), 'utf8');
      let report;
      try {
        report = JSON.parse(raw);
      } catch {
        console.warn(`  skipped ${file}: not valid JSON`);
        continue;
      }
      if (!report?.scores) {
        console.warn(`  skipped ${file}: no scores block`);
        continue;
      }
      // A report produced by older code can carry a verdict the current engine would not give. Rather
      // than publish something the tool itself no longer stands behind, refuse it and name the fix.
      const producedBy = report.run?.tool_version || 'unknown';
      if (producedBy !== TOOL_VERSION) {
        stale.push({ file, producedBy });
        if (!ALLOW_STALE) continue;
      }
      const id = file.replace(/\.json$/, '');
      fs.writeFileSync(path.join(REPORTS_OUT, file), raw);
      manifest.push({
        id,
        host: (report.target.canonical_origin || report.target.seed || id).replace(/^https?:\/\//, ''),
        verdict: report.scores.verdict,
        overall_percent: report.scores.overall_percent,
        started_at: report.run.started_at,
        pages: report.sample?.pages?.length ?? 0,
      });
    }
  }
  manifest.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 1));

  console.log(`  reports:   ${manifest.length} published  (engine v${TOOL_VERSION})`);
  for (const m of manifest) console.log(`             ${m.host} · ${m.verdict} · ${m.overall_percent ?? '—'}%`);
  if (stale.length) {
    console.warn(`\n  ${stale.length} report(s) were produced by an older engine:`);
    for (const t of stale) console.warn(`    ${t.file} — v${t.producedBy}, engine is now v${TOOL_VERSION}`);
    console.warn(ALLOW_STALE
      ? '  ALLOW_STALE=1 is set, so they were published anyway.'
      : `  They were NOT published. Re-run those audits, or set ALLOW_STALE=1 to publish them as they are.`);
  }
  if (!manifest.length && !stale.length) {
    console.warn('\n  No reports found. Run an audit in the engine first:');
    console.warn(`    cd ${TOOL} && npm run audit -- example.com --json runs/example.json\n`);
  }
  console.log('\n  Remember to commit public/data, or the deploy will not see these reports.');
}

/** No engine — a Netlify or CI build. Publish what is committed, but check it is usable first. */
function verifyCommitted() {
  console.log(`  engine:    not reachable at ${TOOL}`);
  console.log('             publishing the committed public/data instead (this is normal on Netlify)');

  if (!fs.existsSync(REGISTER_FILE) || !fs.existsSync(MANIFEST_FILE)) {
    fail(
      'there is no engine to build from, and public/data is missing or incomplete',
      'Run `npm run build` on a machine that has the engine, commit public/data, and push.',
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch (e) {
    fail(`public/data/reports.json is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(manifest)) fail('public/data/reports.json is not a list of reports');

  // A manifest entry with no file behind it is a dead card on the published site, so it fails the
  // build here rather than becoming a 404 the visitor discovers.
  const missing = manifest.filter((m) => !fs.existsSync(path.join(REPORTS_OUT, `${m.id}.json`)));
  if (missing.length) {
    fail(
      `${missing.length} report(s) in the manifest have no committed file: ${missing.map((m) => m.id).join(', ')}`,
      'Re-run the build where the engine is, then commit the whole public/data folder.',
    );
  }

  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTER_FILE, 'utf8'));
  } catch (e) {
    fail(`public/data/register.json is not valid JSON: ${e.message}`);
  }
  const citations = Object.keys(reg.resolved || {}).length;
  if (!citations) fail('public/data/register.json holds no resolved citations — the Reference button would be empty');
  console.log(`  register:  ${citations} resolved citations (baked ${reg.built_at || 'at an unknown time'})`);

  console.log(`  reports:   ${manifest.length} published`);
  for (const m of manifest) console.log(`             ${m.host} · ${m.verdict} · ${m.overall_percent ?? '—'}%`);
}

if (fs.existsSync(TOOL)) await regenerate();
else verifyCommitted();

// ── Refuse to ship key material ───────────────────────────────────────────
// Reports are generated from live API calls, so a key could in principle reach one through a
// recorded request URL. Publishing is one-way, so this is checked every build, never assumed.
const SECRET_PATTERNS = [
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/sk-ant-[0-9A-Za-z_-]{20,}/, 'Anthropic API key'],
  [/sk_live_[0-9a-f]{16,}/, 'live secret key'],
  [/[?&](?:key|api_key|access_token)=[0-9A-Za-z_-]{16,}/, 'key in a query string'],
];
const offenders = [];
function scanForSecrets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { scanForSecrets(full); continue; }
    if (!/\.(js|json|css|html|txt|md|map)$/i.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const [re, label] of SECRET_PATTERNS) {
      const m = re.exec(text);
      if (m) offenders.push({ file: path.relative(ROOT, full), label, at: m.index });
    }
  }
}
scanForSecrets(path.join(ROOT, 'public'));
if (offenders.length) {
  console.error('\n  Refusing to publish — key material found in public/:');
  for (const o of offenders) console.error(`    ${o.file}: ${o.label} at offset ${o.at}`);
  console.error('  Remove it from the source report, then rotate that key — it is already on disk.\n');
  process.exit(1);
}
console.log('  secrets:   none found in public/');

console.log('\n  Build complete — publish the public/ folder.\n');
