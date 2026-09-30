// Dashboard: run control, live progress, scoring views and the Reference affordance (R-SRC-7).
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const esc = (s) => String(s ?? '');
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

const STATUS_COLORS = { PASS: 'var(--pass)', WARN: 'var(--warn)', FAIL: 'var(--fail)', ERROR: 'var(--modelled)', NOT_APPLICABLE: 'var(--na)', NOT_TESTABLE: 'var(--na)' };
const SEV_COLORS = { CRITICAL: 'var(--critical)', HIGH: 'var(--fail)', MEDIUM: 'var(--warn)', LOW: 'var(--na)' };

let REGISTER = null;
let REPORT = null;

/**
 * Citations were resolved at build time into data/register.json, so the published site needs no
 * backend. The lookup order mirrors the engine's: exact checkpoint, then the reason code, then the
 * factor — whichever the finding carries.
 */
let REGISTER_DATA = null;
// Hover races: a later hover must win, so each showRef() call takes a ticket and abandons
// its render if another hover has started since.
let REF_TOKEN = 0;
async function loadRegister() {
  try {
    REGISTER_DATA = await fetch('data/register.json').then((r) => r.json());
  } catch {
    REGISTER_DATA = null;
  }
}

async function resolveSources({ check_id, checkpoint, reason_code }) {
  if (!REGISTER_DATA) return null;
  const r = REGISTER_DATA.resolved;
  return (
    r[`${check_id}|${checkpoint || ''}|${reason_code || ''}`]
    || Object.entries(r).find(([k]) => k.startsWith(`${check_id}|`) && reason_code && k.endsWith(`|${reason_code}`))?.[1]
    || r[`${check_id}||`]
    || null
  );
}

const pop = $('#ref-pop');
let popTimer = null;

async function showRef(btn) {
  const data = {
    check_id: btn.dataset.check,
    checkpoint: btn.dataset.checkpoint || null,
    reason_code: btn.dataset.reason || null,
  };
  const token = ++REF_TOKEN;
  const resolved = await resolveSources(data);
  if (token !== REF_TOKEN) return; // a later hover won the race
  // The live register wins over the copy embedded in the report. The register is re-resolved on a
  // schedule (R-SRC-5) — URLs move and entries are re-dated — so a report opened weeks later should
  // show what the register says now, not what it said when the audit ran.
  let embedded = null;
  if (btn.dataset.sources) {
    try { embedded = JSON.parse(btn.dataset.sources); } catch { embedded = null; }
  }
  const sources = resolved?.sources?.length ? resolved.sources : embedded || [];
  const alsoRegistered = resolved?.also_registered || [];

  pop.innerHTML = '';
  const label = data.checkpoint || data.reason_code || data.check_id;
  pop.appendChild(el('h4', null, `Source for ${label}`));

  if (resolved?.condition) {
    const c = el('div', 'ref-condition');
    c.appendChild(el('strong', null, 'Condition: '));
    c.appendChild(document.createTextNode(resolved.condition));
    pop.appendChild(c);
  }
  // Say plainly whether the register maps these sources to this exact condition or to the check as
  // a whole. Most rows defer to the factor, and implying otherwise is what makes a citation unsafe.
  if (resolved?.specificity) {
    const scope = el('div', `ref-scope ${resolved.specificity}`);
    scope.textContent = resolved.specificity === 'CONDITION'
      ? 'Registered against this condition'
      : 'Supports this factor generally — the register does not map a source to this specific condition';
    pop.appendChild(scope);
  }

  if (!sources.length) pop.appendChild(el('div', 'note', 'No source registered for this item.'));

  for (const s of sources) {
    const d = el('div', 'ref-src');
    const pubLine = el('div');
    pubLine.appendChild(el('span', 'pub', s.publisher || s.ref));
    pubLine.appendChild(el('span', `tier ${s.tier || ''}`, (s.tier || '').replace(/_/g, ' ')));
    d.appendChild(pubLine);
    if (s.title) d.appendChild(el('div', 'title', s.title));
    if (s.url) {
      const a = el('a', null, s.url);
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      d.appendChild(a);
    } else {
      d.appendChild(el('div', 'note', s.source_class || 'No external URL registered.'));
    }
    // Each source states what it establishes, in the register's own words (R-SRC-6).
    if (s.note) d.appendChild(el('div', 'note', s.note));
    if (s.verified && /not verified/i.test(s.verified)) d.appendChild(el('div', 'note', `URL verification: ${s.verified}`));
    pop.appendChild(d);
  }

  if (resolved?.threshold_by && /tool policy/i.test(resolved.threshold_by)) {
    pop.appendChild(el('div', 'ref-foot', "This threshold is this tool's own standard, not a search-engine requirement."));
  }
  if (resolved?.unsourced_note) pop.appendChild(el('div', 'ref-foot', resolved.unsourced_note));
  // Nothing is hidden: refs the register lists for the factor but that do not speak to this
  // condition are named here rather than shown as though they supported the finding (F-SRC-2).
  if (alsoRegistered.length) {
    pop.appendChild(el('div', 'ref-foot', `Also registered for this factor, but not cited here because it does not address this condition: ${alsoRegistered.map((s) => `${s.publisher} — ${s.title}`).join('; ')}.`));
  }

  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.top = `${window.scrollY + r.bottom + 8}px`;
  pop.style.left = `${window.scrollX + r.left}px`;
  const pr = pop.getBoundingClientRect();
  if (pr.right > window.innerWidth - 12) pop.style.left = `${Math.max(12, window.scrollX + window.innerWidth - pr.width - 12)}px`;
  if (pr.bottom > window.innerHeight + window.scrollY - 8) {
    pop.style.top = `${Math.max(window.scrollY + 8, window.scrollY + r.top - pr.height - 8)}px`;
  }
}

function hideRef() {
  popTimer = setTimeout(() => {
    pop.hidden = true;
  }, 180);
}
pop.addEventListener('mouseenter', () => clearTimeout(popTimer));
pop.addEventListener('mouseleave', hideRef);
document.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('.ref-btn');
  if (btn) {
    clearTimeout(popTimer);
    showRef(btn);
  }
});
document.addEventListener('mouseout', (e) => {
  if (e.target.closest('.ref-btn')) hideRef();
});
document.addEventListener('focusin', (e) => {
  const btn = e.target.closest('.ref-btn');
  if (btn) showRef(btn);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pop.hidden = true;
});

/** Reference button for any factor or child item. */
function refBtn({ check_id, checkpoint, reason_code, sources, url, note }) {
  const b = el('button', 'ref-btn', 'Reference');
  b.type = 'button';
  b.dataset.check = check_id || '';
  if (checkpoint) b.dataset.checkpoint = checkpoint;
  if (reason_code) b.dataset.reason = reason_code;
  if (sources?.length) b.dataset.sources = JSON.stringify(sources);
  if (url) b.dataset.url = url;
  if (note) b.dataset.note = note;
  b.setAttribute('aria-label', `Show source for ${checkpoint || reason_code || check_id}`);
  return b;
}

// ── Transient message ──────────────────────────────────────────────────────

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 6000);
}

// ── Report rendering ──────────────────────────────────────────────────────
function render(report) {
  REPORT = report;
  $('#idle').hidden = true;
  $('#report').hidden = false;
  renderScore(report);
  renderDistribution(report);
  renderSections(report);
  renderSample(report);
  renderChecklist(report);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Report actions: print, export, expand ────────────────────────────────
$('#btn-all').addEventListener('click', () => {
  history.pushState(null, '', location.pathname);
  openFromHash();
  window.scrollTo({ top: 0 });
});
$('#btn-print').addEventListener('click', () => window.print());
$('#btn-json').addEventListener('click', () => {
  if (!REPORT) return;
  const blob = new Blob([JSON.stringify(REPORT, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const host = (REPORT.target.canonical_origin || REPORT.target.seed || 'audit').replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_');
  a.download = `audit-${host}-${REPORT.run.started_at.slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#btn-expand').addEventListener('click', (e) => {
  const expand = e.target.textContent.startsWith('Expand');
  document.querySelectorAll('.factor-body, .cat-body').forEach((n) => { n.hidden = !expand; });
  document.querySelectorAll('#report details').forEach((d) => { d.open = expand; });
  e.target.textContent = expand ? 'Collapse all' : 'Expand all';
});

function renderScore(report) {
  const s = report.scores;
  const ring = $('#ring-fg');
  const value = s.overall ?? 0;
  ring.style.strokeDashoffset = String(327 - 327 * (s.suppressed ? 0 : value));
  ring.style.stroke = s.suppressed ? 'var(--na)' : value >= 0.85 ? 'var(--pass)' : value >= 0.5 ? 'var(--warn)' : 'var(--fail)';
  $('#score-number').textContent = s.overall_percent == null ? '—' : s.overall_percent;
  $('#score-suffix').textContent = s.overall_percent == null ? '' : '%';
  const badge = $('#verdict-badge');
  badge.textContent = s.verdict.replace(/_/g, ' ');
  badge.className = `verdict ${s.verdict}`;
  const note = $('#score-note');
  note.innerHTML = '';
  if (s.gated_by.length) {
    const blocked = s.verdict === 'BLOCKED';
    note.appendChild(el('div', null, blocked
      ? `Capped at 40%: a critical failure prevents crawling or indexing — ${s.gated_by.join(', ')}.`
      : `Capped at 40% by a critical failure found during a successful crawl — ${s.gated_by.join(', ')}. The site was reached and ${report.sample.pages.length} page(s) were analysed; the cap reflects the severity of the finding, not a crawl failure.`));
  }
  for (const c of s.caveats) note.appendChild(el('div', null, `· ${c}`));
  if (s.missing_inputs.length) note.appendChild(el('div', null, `Missing inputs: ${s.missing_inputs.join(', ')}.`));

  const started = new Date(report.run.started_at);
  const secs = Math.round((new Date(report.run.finished_at) - started) / 1000);
  $('#report-stamp').textContent = `${report.target.canonical_origin || report.target.seed} · audited ${started.toLocaleString()} · ${secs}s · tool v${report.run.tool_version}`;

  const meta = $('#run-meta');
  meta.innerHTML = '';
  const rows = [
    ['Target', report.target.canonical_origin || report.target.seed],
    ['Run', `${report.run.run_status} · ${report.run.run_quality}`],
    ['Gate', `robots.txt ${report.run.gate.status}${report.run.gate.passed ? '' : ` — ${report.run.gate.reason_code}`}`],
    ['Site shape', report.target.site_shape || '—'],
    ['Multilingual', report.target.is_multilingual ? `yes (${(report.target.multilingual_signals || []).join('; ')})` : 'no'],
    ['Rendering', report.target.render_strategy || (report.run.capabilities.render_js ? 'not determined' : 'unavailable')],
    ['Sample', `${report.sample.pages.length} page(s) · ${report.sample.quality}`],
    ['Tool', `v${report.run.tool_version} · thresholds ${report.run.threshold_set_version} · rubric ${report.run.rubric_version}`],
  ];
  for (const [k, v] of rows) {
    meta.appendChild(el('dt', null, k));
    meta.appendChild(el('dd', null, v));
  }
  for (const h of report.headlines || []) {
    const d = el('div', 'headline', `${h.reason_code} — ${h.summary}`);
    $('#score-note').prepend(d);
  }
}

function bars(rows, total) {
  const body = $('#dist-body');
  body.innerHTML = '';
  const max = Math.max(1, ...rows.map((r) => r.count));
  for (const r of rows) {
    const row = el('div', 'bar-row');
    const label = el('div', 'label', r.label);
    label.title = r.title || r.label;
    row.appendChild(label);
    const track = el('div', 'bar-track');
    if (Array.isArray(r.stack)) {
      for (const seg of r.stack) {
        if (!seg.count) continue;
        const f = el('div', 'bar-fill');
        f.style.width = `${(seg.count / max) * 100}%`;
        f.style.background = seg.color;
        f.title = `${seg.label}: ${seg.count}`;
        track.appendChild(f);
      }
    } else {
      const f = el('div', 'bar-fill');
      f.style.width = `${(r.count / max) * 100}%`;
      f.style.background = r.color;
      track.appendChild(f);
    }
    row.appendChild(track);
    row.appendChild(el('div', 'count', String(r.count)));
    if (r.ref) row.querySelector('.label').appendChild(r.ref);
    body.appendChild(row);
  }
  $('#dist-legend').innerHTML = '';
  for (const [k, c] of Object.entries(rows.legend || {})) {
    const s = el('span');
    const i = el('i');
    i.style.background = c;
    s.appendChild(i);
    s.appendChild(document.createTextNode(k));
    $('#dist-legend').appendChild(s);
  }
}

function renderDistribution(report) {
  const d = report.scores.distribution;
  const mode = $('.dist-toggle button.active')?.dataset.dist || 'severity';
  let rows = [];
  if (mode === 'severity') {
    rows = Object.entries(d.by_severity).map(([k, v]) => ({ label: k, count: v, color: SEV_COLORS[k] }));
    rows.push({ label: 'Not testable', count: d.by_status.NOT_TESTABLE || 0, color: 'var(--na)' });
    rows.push({ label: 'Passed', count: d.by_status.PASS || 0, color: 'var(--pass)' });
    rows.legend = { 'Findings by severity': 'var(--fail)', 'Excluded from scoring': 'var(--na)' };
  } else if (mode === 'section') {
    const sections = report.scores.sections;
    rows = sections.map((s) => {
      const c = d.by_section[s.section] || {};
      return {
        label: `${s.section}. ${s.name}`,
        title: s.name,
        count: (c.FAIL || 0) + (c.WARN || 0),
        stack: [
          { label: 'FAIL', count: c.FAIL || 0, color: 'var(--fail)' },
          { label: 'WARN', count: c.WARN || 0, color: 'var(--warn)' },
          { label: 'PASS', count: c.PASS || 0, color: 'var(--pass)' },
          { label: 'Excluded', count: (c.NOT_APPLICABLE || 0) + (c.NOT_TESTABLE || 0), color: 'var(--na)' },
        ],
      };
    });
    rows.legend = { FAIL: 'var(--fail)', WARN: 'var(--warn)', PASS: 'var(--pass)', 'Not applicable / not testable': 'var(--na)' };
  } else {
    rows = d.by_reason_code.map((r) => ({
      label: r.reason_code,
      title: `${r.check_id} · ${r.summary}`,
      count: r.count,
      color: r.status === 'FAIL' ? SEV_COLORS[r.severity] || 'var(--fail)' : 'var(--warn)',
      ref: refBtn({ check_id: r.check_id, reason_code: r.reason_code }),
    }));
    rows.legend = { 'FAIL by severity': 'var(--fail)', WARN: 'var(--warn)' };
  }
  bars(rows, d.total_findings);
}

document.querySelectorAll('.dist-toggle button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.dist-toggle button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    if (REPORT) renderDistribution(REPORT);
  });
});

function renderSections(report) {
  const host = $('#section-scores');
  host.innerHTML = '';
  for (const s of report.scores.sections) {
    const row = el('div', 'sec-row');
    const name = el('div', 'name');
    name.appendChild(el('span', null, `${s.section}. ${s.name}`));
    row.appendChild(name);
    row.appendChild(el('div', 'pct', s.score == null ? '—' : pct(s.score)));
    const track = el('div', 'sec-track');
    const fill = el('div', 'sec-fill');
    fill.style.width = `${(s.score ?? 0) * 100}%`;
    fill.style.background = s.score == null ? 'var(--na)' : s.score >= 0.85 ? 'var(--pass)' : s.score >= 0.5 ? 'var(--warn)' : 'var(--fail)';
    track.appendChild(fill);
    row.appendChild(track);
    const bits = [`weight ${s.weight}`, `${s.evaluated} evaluated`];
    if (s.not_applicable) bits.push(`${s.not_applicable} n/a`);
    if (s.not_testable) bits.push(`${s.not_testable} not testable`);
    if (s.errors) bits.push(`${s.errors} error`);
    if (s.modelled) bits.push('modelled inputs');
    row.appendChild(el('div', 'sec-meta', bits.join(' · ')));
    host.appendChild(row);
  }
}

function renderSample(report) {
  const tbody = $('#sample-table tbody');
  tbody.innerHTML = '';
  $('#sample-quality').textContent = `${report.sample.pages.length} of max 10 · quality ${report.sample.quality}`;
  for (const p of report.sample.pages) {
    const tr = el('tr');
    tr.appendChild(el('td', null, p.page_type));
    const td = el('td');
    const a = el('a', null, p.url);
    a.href = p.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    td.appendChild(a);
    if (p.selection_reason) td.appendChild(el('div', 'muted', p.selection_reason));
    tr.appendChild(td);
    tr.appendChild(el('td', 'mono', p.pattern_signature));
    tr.appendChild(el('td', 'mono', String(p.group_member_count)));
    tr.appendChild(el('td', 'mono', p.discovery_method));
    tr.appendChild(el('td', 'mono', p.final_status == null ? '—' : String(p.final_status)));
    tr.appendChild(el('td', 'mono', p.indexability_state || '—'));
    tbody.appendChild(tr);
  }
  const absent = report.sample.page_type_absent || [];
  $('#sample-absent').textContent = absent.length
    ? `Page types not filled: ${absent.map((a) => `${a.page_type} (${a.reason})`).join(', ')}. An absent type is not a site failure by itself.`
    : 'Every target page type was filled.';

  const d = report.discovery;
  const body = $('#discovery-body');
  body.innerHTML = '';
  if (!d) {
    body.textContent = 'Discovery did not run.';
    return;
  }
  body.appendChild(el('div', null, `${d.links_harvested} link(s) harvested · ${d.fetch_count} fetch(es) · methods: ${(d.discovery_methods_used || []).join(', ')}`));
  const g = el('div');
  g.style.marginTop = '8px';
  for (const grp of d.groups || []) {
    const c = el('span', 'chip', `${grp.signature} ×${grp.true_member_count}${grp.saturated ? ' (saturated)' : ''}`);
    c.title = grp.example_url;
    g.appendChild(c);
  }
  body.appendChild(g);
  if (d.robots_blocked_candidates?.length) body.appendChild(el('div', 'muted', `Excluded — disallowed for Googlebot: ${d.robots_blocked_candidates.join(', ')}`));
  if (d.auditor_blocked_only?.length) body.appendChild(el('div', 'muted', `Auditor blocked only (tool limitation, not a site defect): ${d.auditor_blocked_only.join(', ')}`));
  if (d.js_only_links?.length) body.appendChild(el('div', 'muted', `${d.js_only_links.length} link(s) visible only after rendering.`));
  if (d.caps_hit?.length) body.appendChild(el('div', 'muted', `Caps hit: ${d.caps_hit.join(', ')}`));
}

function statusPill(status, severity) {
  const wrap = el('span');
  wrap.appendChild(el('span', `pill ${status}`, status.replace(/_/g, ' ')));
  if (severity) wrap.appendChild(el('span', ` sev ${severity}`, ` ${severity}`));
  return wrap;
}

function renderChecklist(report) {
  const host = $('#checklist');
  host.innerHTML = '';
  const byCheck = new Map();
  for (const r of report.results) {
    if (!byCheck.has(r.check_id)) byCheck.set(r.check_id, []);
    byCheck.get(r.check_id).push(r);
  }
  for (const sec of report.scores.sections) {
    const cat = el('section', 'cat');
    const header = el('header');
    header.appendChild(el('h3', null, `${sec.section}. ${sec.name}`));
    const score = el('span', 'cat-score', sec.score == null ? '—' : pct(sec.score));
    score.style.color = sec.score == null ? 'var(--muted)' : sec.score >= 0.85 ? 'var(--pass)' : sec.score >= 0.5 ? 'var(--warn)' : 'var(--fail)';
    header.appendChild(score);
    cat.appendChild(header);
    const body = el('div', 'cat-body');
    const factors = report.checklist.filter((f) => f.section === sec.section);
    for (const f of factors) {
      body.appendChild(renderFactor(f, byCheck.get(f.id) || [], report));
    }
    cat.appendChild(body);
    header.addEventListener('click', () => (body.hidden = !body.hidden));
    host.appendChild(cat);
  }
}

function renderFactor(factor, results, report) {
  const wrap = el('article', 'factor');
  const header = el('header');
  header.appendChild(el('span', 'id', factor.id));
  const name = el('span', 'name');
  name.appendChild(document.createTextNode(factor.name));
  if (factor.note) name.appendChild(el('span', 'note', factor.note));
  header.appendChild(name);

  const chk = report.scores.checks.filter((c) => c.check_id === factor.id);
  const worst = results.filter((r) => ['FAIL', 'WARN', 'PASS'].includes(r.status)).reduce((a, r) => (['FAIL', 'WARN', 'PASS'].indexOf(r.status) < ['FAIL', 'WARN', 'PASS'].indexOf(a) ? r.status : a), null);
  const status = factor.unspecified ? 'UNSPECIFIED' : worst || results[0]?.status || 'NOT_TESTABLE';
  const sev = results.find((r) => r.status === worst && r.severity)?.severity;
  header.appendChild(statusPill(status, sev));
  const scoreVal = chk.length ? chk.reduce((a, c) => a + (c.score ?? 0), 0) / chk.filter((c) => c.score != null).length : null;
  header.appendChild(el('span', 'factor-score', factor.unspecified || !chk.length || Number.isNaN(scoreVal) ? '—' : pct(scoreVal)));
  header.appendChild(refBtn({ check_id: factor.id }));
  wrap.appendChild(header);

  const body = el('div', 'factor-body');
  body.hidden = true;
  if (factor.unspecified) {
    body.appendChild(el('p', 'muted', factor.note));
  } else if (!results.length) {
    body.appendChild(el('p', 'muted', 'No result recorded for this factor.'));
  } else {
    // Whatever set the factor's status comes first. Expanding a WARN factor and meeting a row of
    // passes hides the very thing the header is reporting.
    const ORDER = { FAIL: 0, ERROR: 1, WARN: 2, NOT_TESTABLE: 3, PASS: 4, NOT_APPLICABLE: 5 };
    const SEV = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const ordered = [...results].sort(
      (a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)
        || (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9)
        || String(a.scope).localeCompare(String(b.scope)),
    );
    for (const r of ordered) body.appendChild(renderResult(r));
  }
  wrap.appendChild(body);
  header.addEventListener('click', (e) => {
    if (e.target.closest('.ref-btn')) return;
    body.hidden = !body.hidden;
  });
  return wrap;
}

function renderResult(r) {
  const card = el('article', 'result');
  const head = el('header');
  head.appendChild(statusPill(r.status, r.severity));
  head.appendChild(el('span', 'target', r.target_url ? `${r.scope}: ${r.target_url}` : r.scope));
  if (r.reason_code) head.appendChild(el('span', 'reason', r.reason_code));
  if (r.confidence && r.confidence !== 'OBSERVED') head.appendChild(el('span', 'reason', r.confidence));
  head.appendChild(refBtn({ check_id: r.check_id, checkpoint: r.sub_findings?.find((s) => s.reason_code === r.reason_code)?.checkpoint, reason_code: r.reason_code, sources: r.sources, url: r.reference_url }));
  card.appendChild(head);
  card.appendChild(el('div', 'summary', r.summary));
  if (r.routing_note) card.appendChild(el('div', 'caveat', r.routing_note));
  for (const c of r.caveats || []) card.appendChild(el('div', 'caveat', c));

  const subs = (r.sub_findings || []).filter((s) => s.reason_code !== r.reason_code);
  const notes = r.notes || [];
  if (subs.length || notes.length) {
    const ul = el('ul', 'sub-list');
    for (const s of subs) {
      const li = el('li');
      li.appendChild(statusPill(s.status, s.severity));
      li.appendChild(el('span', 'sub-text', s.summary));
      li.appendChild(refBtn({ check_id: r.check_id, checkpoint: s.checkpoint, reason_code: s.reason_code, sources: s.sources }));
      ul.appendChild(li);
    }
    for (const n of notes) {
      const li = el('li');
      li.appendChild(el('span', 'pill NOT_APPLICABLE', 'NOTE'));
      li.appendChild(el('span', 'sub-text', n.summary));
      li.appendChild(refBtn({ check_id: r.check_id, reason_code: n.reason_code, sources: n.sources }));
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  if (r.remediation) {
    const rem = el('div', 'remediation');
    rem.appendChild(el('div', null, r.remediation.action));
    if (r.remediation.proposed) {
      const pre = el('pre', null, r.remediation.proposed);
      rem.appendChild(pre);
    }
    rem.appendChild(el('div', 'muted', `Confidence: ${r.remediation.confidence}. Values shown are observed on the page; placeholders must be supplied.`));
    card.appendChild(rem);
  }
  if (r.evidence?.length) {
    const d = el('details', 'evidence');
    d.appendChild(el('summary', null, `Evidence (${r.evidence.length})`));
    for (const e of r.evidence) {
      const item = el('div', 'ev-item');
      item.appendChild(el('b', null, `${e.kind} · ${e.fetch_profile} · ${e.selector_or_key || ''}`));
      const v = el('span', 'val', e.observed_value == null ? '(null)' : e.observed_value);
      item.appendChild(v);
      if (e.expected_value) item.appendChild(el('div', 'muted', `expected: ${e.expected_value}`));
      const bits = [e.source_url, e.observed_at, e.elapsed_ms != null ? `${e.elapsed_ms} ms` : null, e.stall_stage ? `stalled at ${e.stall_stage}` : null].filter(Boolean);
      item.appendChild(el('div', 'muted', bits.join(' · ')));
      d.appendChild(item);
    }
    card.appendChild(d);
  }
  if (r.metrics && Object.keys(r.metrics).length) {
    const d = el('details', 'metrics');
    d.appendChild(el('summary', null, 'Measurements'));
    d.appendChild(el('pre', null, JSON.stringify(r.metrics, null, 2)));
    card.appendChild(d);
  }
  if (r.cross_references?.length) card.appendChild(el('div', 'muted', `Related: ${r.cross_references.join(', ')}`));
  return card;
}

// ── Previous audits: reopen a saved report without re-running ────────────
async function loadRecent() {
  try {
    const manifest = await fetch('data/reports.json').then((r) => r.json());
    if (!manifest.length) return;
    const list = $('#recent-list');
    list.innerHTML = '';
    const rows = [];
    for (const m of manifest.slice(0, 50)) {
      try {
        const rep = await fetch(`data/reports/${m.id}.json`).then((r) => r.json());
        if (rep?.scores) rows.push({ id: m.id, rep });
      } catch {
        /* a report that cannot be read is skipped rather than breaking the list */
      }
    }
    if (!rows.length) return;
    for (const { id, rep } of rows) {
      const li = el('li');
      li.appendChild(el('span', 'host', (rep.target.canonical_origin || rep.target.seed || id).replace(/^https?:\/\//, '')));
      const badge = el('span', `verdict ${rep.scores.verdict}`, rep.scores.verdict.replace(/_/g, ' '));
      badge.style.margin = '0';
      li.appendChild(badge);
      li.appendChild(el('span', 'when', `${rep.scores.overall_percent == null ? '—' : rep.scores.overall_percent + '%'} · ${new Date(rep.run.started_at).toLocaleString()}`));
      const open = el('button', 'ghost', 'Open');
      open.type = 'button';
      open.addEventListener('click', () => {
        history.pushState(null, '', `#run=${id}`); // pushState, so Back returns to the list
        render(rep);
      });
      li.appendChild(open);
      list.appendChild(li);
    }
    $('#recent').hidden = false;
  } catch {
    /* the list is a convenience; its absence must never block a new run */
  }
}

/** Deep link: /#run=<id> opens that saved report directly. */
async function openFromHash() {
  const m = /#run=([\w-]+)/.exec(location.hash);
  if (!m) {
    $('#report').hidden = true;
    $('#idle').hidden = false;
    return false;
  }
  try {
    const rep = await fetch(`data/reports/${m[1]}.json`).then((r) => r.json());
    if (rep?.scores) {
      render(rep);
      return true;
    }
  } catch {
    /* fall through to the report list */
  }
  toast(`No published report for "${m[1]}". Pick one from the list below.`);
  $('#report').hidden = true;
  $('#idle').hidden = false;
  return false;
}

loadRegister();
// The list always loads: on a published site it is the only way back once a report is open,
// so a visitor arriving on a deep link still has somewhere to go.
loadRecent();
openFromHash();
// Back and forward move between the list and a report, since each opened report sets the hash.
window.addEventListener('hashchange', () => openFromHash());
