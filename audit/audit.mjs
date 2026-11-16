// Differential audit: drives the real page, reads what it PRINTS, and checks every printed claim against exact arithmetic.
// usage: CHROME_PATH=... node audit.mjs path/to/index.html [seed]
import { createRequire } from 'module';
import { Q, hund, clampQ, SCALE, gradeOf, COURSES, course, needHi, needLo, steps } from './oracle.mjs';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const file = process.argv[2], seed0 = Number(process.argv[3] || 1);
let s = seed0 >>> 0; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const rd = (max, k) => { const p = 10 ** k; return (Math.floor(rnd() * max * p) / p).toString(); };
const toDec = q => { for (let k = 0; k <= 8; k++) { const t = q.mul(10n ** BigInt(k)); if (t.d === 1n) { const n = t.n < 0n ? -t.n : t.n, str = n.toString().padStart(k + 1, '0'); return (t.n < 0n ? '-' : '') + (k ? str.slice(0, -k) + '.' + str.slice(-k) : str); } } return null; };
const MAX = { ipa: { part: 100, asg: 100, mt: 30, fin: 100 }, afm: { part: 100, grp: 100, crit1: 100, crit2: 100, crit3: 100, crit4: 100, fin: 100 } };
const WT = { ipa: { part: 10, asg: 35, mt: 20, fin: 35 }, afm: { part: 20, grp: 25, crit1: 5, crit2: 5, crit3: 5, crit4: 5, fin: 35 } };

function randomMarks(key, { finalMode }) {
  const m = {};
  for (const [id] of COURSES[key]) { const k = pick([0, 1, 2]); m[id] = rnd() < 0.12 ? null : rd(MAX[key][id], k); }
  if (finalMode === 'blank') m.fin = null; if (finalMode === 'entered') m.fin = rd(100, pick([0, 1, 2]));
  return m;
}
// pre-final marks chosen so banked == target exactly (one mark solved for), for hitting need == 0 / need == 100 exactly.
function solvedMarks(key, target) {
  for (let t = 0; t < 200; t++) {
    const m = { fin: null }, ids = COURSES[key].map(c => c[0]).filter(i => i !== 'fin'), last = ids[ids.length - 1]; let sum = new Q(0n);
    for (const id of ids.slice(0, -1)) { m[id] = rd(MAX[key][id], 1); sum = sum.add(Q.of(m[id]).mul(WT[key][id]).div(MAX[key][id])); }
    const x = Q.of(target).sub(sum).mul(MAX[key][last]).div(WT[key][last]), d = toDec(x);
    if (d !== null && x.ge(0n) && x.le(BigInt(MAX[key][last]))) { m[last] = d; return m; }
  }
  return null;
}
function nearCutoffMarks(key) { // final entered so the exact total lands within 1e-4 of a cutoff, on either side
  const m = randomMarks(key, { finalMode: 'blank' }); for (const id in m) if (m[id] === null) m[id] = rd(MAX[key][id], 1);
  const c = course(key, m), g = pick(SCALE.slice(0, 10)), x = needHi(c, g.cut);
  if (x.lt(0n) || x.gt(100n)) return null;
  const f = x.mul(10000n).floorDiv(1n); m.fin = toDec(new Q(f + pick([-1n, 0n, 1n, 2n]), 10000n)); // within 1e-4 of the need
  return m.fin !== null && Q.of(m.fin).ge(0n) && Q.of(m.fin).le(100n) ? m : null;
}
const cases = [];
const add = (kind, key, m) => { if (m) cases.push({ kind, key, m }); };
for (const key of ['ipa', 'afm']) {
  for (let i = 0; i < 1500; i++) add('rand-blank', key, randomMarks(key, { finalMode: 'blank' }));
  for (let i = 0; i < 1500; i++) add('rand-entered', key, randomMarks(key, { finalMode: 'entered' }));
  for (let i = 0; i < 800; i++) add('rand-any', key, randomMarks(key, {}));
  for (let i = 0; i < 1500; i++) add('near-cutoff', key, nearCutoffMarks(key));
  for (const g of SCALE.slice(0, 10)) for (let i = 0; i < 40; i++) { add('need=100', key, solvedMarks(key, g.cut.sub(35n))); add('need=0', key, solvedMarks(key, g.cut)); }
}

const fails = {}, fail = (rule, c, detail) => { (fails[rule] ||= []).push({ rule, kind: c.kind, key: c.key, m: JSON.stringify(c.m), detail }); };
const L = t => t.replace('−', '-');
const pct = t => (/^(-?\d+(?:\.\d+)?)%$/.exec(t.trim()) || [])[1];

function check(c, r) {
  const ex = course(c.key, c.m);
  // ---- score / letter / gap (complete course) -------------------------------------------------------
  if (ex.complete) {
    const T = ex.lo, g = gradeOf(T), sh = pct(r.pct);
    if (L(r.letter) !== g.g) fail('letter', c, `page ${r.letter} exact ${g.g} total ${hund(T.round100())}`);
    if (sh === undefined) fail('score-format', c, r.pct);
    else {
      if (gradeOf(Q.parse(sh)).g !== g.g) fail('score-crosses-cutoff', c, `shows ${sh}% beside ${r.letter}; exact total ${T.n}/${T.d} = ${T.num()}`);
      if (Q.parse(sh).sub(T).cmp(new Q(1n, 100n)) >= 0 || T.sub(Q.parse(sh)).cmp(new Q(1n, 100n)) >= 0) fail('score-error>0.01', c, `${sh} vs ${T.num()}`);
    }
    const gi = SCALE.indexOf(g);
    if (gi > 0) { const gap = SCALE[gi - 1].cut.sub(T), mm = /^(\d+(?:\.\d+)?) pts below/.exec(r.pts);
      if (!mm) fail('gap-format', c, r.pts); else if (hund(gap.ceil100()) !== mm[1]) fail('gap-rounding', c, `page ${mm[1]} exact gap ${gap.num()}`); }
    else if (!/^Top band/.test(r.pts)) fail('gap-format', c, r.pts);
  } else {
    const g0 = gradeOf(ex.lo), g1 = gradeOf(ex.hi), m = /^([\d.]+)%?–?([\d.]*)%?$/.exec(r.pct.replace(/%/g, ''));
    if (!m) fail('score-format', c, r.pct);
    else { const a = Q.parse(m[1]), b = Q.parse(m[2] || m[1]); if (gradeOf(a).g !== g0.g || gradeOf(b).g !== g1.g) fail('range-crosses-cutoff', c, `${r.pct} grades ${g0.g}..${g1.g}`); }
  }
  // ---- needed-final table ---------------------------------------------------------------------------
  const hasFinalNeedCtx = true;
  for (const row of r.need) {
    const g = SCALE.find(x => x.g === L(row.g)), hi = needHi(ex, g.cut), lo = needLo(ex, g.cut), E = ex.E.gt(0n);
    const nums = (row.show.match(/\d+(?:\.\d+)?/g) || []), status = row.status;
    if (hi.le(0n)) { if (status !== 'Already secured') fail('need-class', c, `${g.g}: exact need ${hi.num()} <= 0 but page says "${status}" ${row.show}`); continue; }
    if (lo.gt(100n)) { if (status !== 'Out of reach') fail('need-class', c, `${g.g}: exact best-case need ${lo.num()} > 100 but "${status}"`); continue; }
    if (status === 'Already secured' || status === 'Out of reach') { fail('need-class', c, `${g.g}: exact need ${lo.num()}..${hi.num()} but page says "${status}" ${row.show}`); continue; }
    const want = E ? (lo.le(0n) && hi.le(100n) ? [hund(hi.ceil100())] : [hund((lo.lt(0n) ? new Q(0n) : lo).ceil100()), hund(hi.ceil100())]) : [hund(hi.ceil100())];
    if (nums.join(',') !== want.join(',')) fail('need-rounding', c, `${g.g}: page ${row.show} exact ${E ? lo.num() + '..' : ''}${hi.num()} want ${want.join('–')}`);
  }
  // ---- chart steps (final blank, no unknown pre-final work) ----------------------------------------
  if (ex.finalBlank && ex.E.eq(0n) && r.paths.length === 1) {
    const want = steps(ex), pts = r.paths[0].match(/-?\d+(?:\.\d+)?/g).map(Number), P = [];
    for (let i = 0; i < pts.length; i += 2) P.push([(pts[i] - 66) / 8.55, (410 - pts[i + 1]) / 90]);
    let diagonal = false; const got = [];
    for (let i = 1; i < P.length; i++) { const dx = Math.abs(P[i][0] - P[i - 1][0]), dy = Math.abs(P[i][1] - P[i - 1][1]); if (dx > 1e-6 && dy > 1e-6) diagonal = true; if (dy > 1e-6) got.push([P[i][0], P[i][1]]); }
    if (diagonal) fail('chart-diagonal', c, r.paths[0]);
    if (got.length !== want.steps.length || got.some((p, i) => Math.abs(p[0] - want.steps[i][0]) > 1e-6 || Math.abs(p[1] - want.steps[i][1]) > 1e-9)) fail('chart-steps', c, `page ${JSON.stringify(got.map(p => p.map(v => +v.toFixed(4))))} exact ${JSON.stringify(want.steps.map(p => p.map(v => +v.toFixed(4))))}`);
    if (Math.abs(P[0][1] - want.start) > 1e-9 || Math.abs(P[P.length - 1][1] - want.end) > 1e-9) fail('chart-endpoints', c, `start/end page ${P[0][1]}/${P[P.length - 1][1]} exact ${want.start}/${want.end}`);
  }
}

// ---- in-page driver ---------------------------------------------------------------------------------
const DRIVER = `(batch, key) => {
  const G = window.__MSC_GPA__, $ = id => document.getElementById(id);
  const want = { ipa: key === 'ipa', afm: key === 'afm', scores: false };
  for (const k in want) { const b = $('show-' + k); if ((b.getAttribute('aria-pressed') === 'true') !== want[k]) b.click(); }
  if (G.getState().active !== key) G.setActive(key);
  return batch.map(m => {
    for (const id in m) G.setMark(key, id, m[id] === null ? null : Number(m[id]));
    G.update();
    return { pct: $('o-pct').textContent, letter: $('o-letter').textContent, pts: $('o-pct-s').textContent,
      need: [...document.querySelectorAll('#need-body tr')].map(tr => ({ g: tr.children[0].textContent, show: tr.children[3].textContent.trim(), status: tr.children[4].textContent.trim() })),
      paths: [...document.querySelectorAll('#plot-content .gp-line')].map(p => p.getAttribute('d')) };
  });
}`;

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + file); await page.waitForFunction(() => window.__MSC_GPA__);
const t0 = Date.now(); let n = 0;
for (const key of ['ipa', 'afm']) {
  const mine = cases.filter(c => c.key === key);
  for (let i = 0; i < mine.length; i += 250) {
    const batch = mine.slice(i, i + 250), res = await page.evaluate(`(${DRIVER})(${JSON.stringify(batch.map(c => c.m))}, ${JSON.stringify(key)})`);
    batch.forEach((c, j) => { check(c, res[j]); n++; });
  }
}
// ---- overall GPA / average score ----------------------------------------------------------------------
const GPA_DRIVER = `(sc) => {
  const G = window.__MSC_GPA__, $ = id => document.getElementById(id), fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const out = [];
  for (const k of ['ipa', 'afm']) { G.setActive(k); }
  for (const s of sc) {
    for (const k of ['ipa', 'afm']) { for (const id in s.marks[k]) G.setMark(k, id, s.marks[k][id] === null ? null : Number(s.marks[k][id])); }
    while ($('cx-0')) $('cx-0').click();
    for (let i = 0; i < s.others.length; i++) $('add-course').click();
    s.others.forEach((o, i) => { const cm = $('cm-' + i); cm.value = o.mode; fire(cm, 'change');
      const cv = $('cv-' + i); if (o.mode !== 'exclude') { cv.value = o.value; fire(cv, 'change'); }
      const cu = $('cu-' + i); cu.value = o.units; fire(cu, 'input'); });
    for (const k of ['ipa', 'afm']) { const lu = $('lu-' + k); lu.value = s.units[k]; fire(lu, 'input'); }
    G.update();
    out.push({ gpa: $('ov-gpa').textContent, pct: $('ov-pct').textContent });
  }
  return out;
}`;
const LET = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'];
const sc = [];
for (let i = 0; i < 1500; i++) {
  const marks = {}, units = { ipa: pick(['3', '1.5', '0', '2', '4']), afm: pick(['3', '1', '2.5', '0']) };
  for (const key of ['ipa', 'afm']) { const full = rnd() < 0.7; marks[key] = randomMarks(key, { finalMode: full ? 'entered' : 'blank' }); if (full) for (const id in marks[key]) if (marks[key][id] === null) marks[key][id] = rd(MAX[key][id], 1); }
  const others = []; for (let j = 0; j < pick([0, 1, 2, 3]); j++) { const mode = pick(['pct', 'pct', 'letter', 'exclude']);
    others.push({ mode, units: pick(['3', '1', '1.5', '2', '0', '4']), value: mode === 'pct' ? pick([rd(100, 1), rd(100, 2), '100', '0', '120', '-5', '79.995']) : pick(LET) }); }
  sc.push({ marks, units, others });
}
const gres = []; for (let i = 0; i < sc.length; i += 100) gres.push(...await page.evaluate(`(${GPA_DRIVER})(${JSON.stringify(sc.slice(i, i + 100))})`));
const half = q => hund(q.round100());
sc.forEach((s, i) => {
  const items = [];
  for (const k of ['ipa', 'afm']) { const c = course(k, s.marks[k]), u = Q.of(s.units[k]); if (u.le(0n)) continue;
    items.push({ u, g0: gradeOf(c.lo).gp, g1: gradeOf(c.hi).gp, p0: c.lo, p1: c.hi }); }
  for (const o of s.others) { const u = Q.of(o.units); if (u.le(0n) || o.mode === 'exclude') continue;
    if (o.mode === 'letter') items.push({ u, g0: SCALE.find(x => x.g === o.value).gp, g1: SCALE.find(x => x.g === o.value).gp });
    else { const v = clampQ(Q.of(o.value), 0n, 100n); items.push({ u, g0: gradeOf(v).gp, g1: gradeOf(v).gp, p0: v, p1: v }); } }
  const c = { kind: 'gpa', key: '-', m: JSON.stringify({ units: s.units, others: s.others }) };
  const U = items.reduce((a, x) => a.add(x.u), new Q(0n)); if (U.le(0n)) return;
  const g0 = items.reduce((a, x) => a.add(x.u.mul(x.g0)), new Q(0n)).div(U), g1 = items.reduce((a, x) => a.add(x.u.mul(x.g1)), new Q(0n)).div(U);
  const wantG = half(g0) === half(g1) ? half(g0) : half(g0) + '–' + half(g1), P = items.filter(x => x.p0), PU = P.reduce((a, x) => a.add(x.u), new Q(0n));
  if (gres[i].gpa !== wantG) fail('gpa', c, `page ${gres[i].gpa} exact ${g0.num()}..${g1.num()} want ${wantG}`);
  if (PU.gt(0n)) { const p0 = P.reduce((a, x) => a.add(x.u.mul(x.p0)), new Q(0n)).div(PU), p1 = P.reduce((a, x) => a.add(x.u.mul(x.p1)), new Q(0n)).div(PU);
    const wantP = half(p0) === half(p1) ? half(p0) + '%' : half(p0) + '–' + half(p1) + '%';
    if (gres[i].pct !== wantP) fail('avg-score', c, `page ${gres[i].pct} want ${wantP} exact ${p0.num()}..${p1.num()}`); }
  n++;
});
console.log(`checked ${n} cases in ${((Date.now() - t0) / 1000).toFixed(1)}s against exact arithmetic  (${file.split('/').slice(-2).join('/')})`);
const rules = Object.keys(fails).sort();
if (!rules.length) console.log('RESULT: 0 failures'); else for (const r of rules) { console.log(`\n✗ ${r}: ${fails[r].length}`); for (const f of fails[r].slice(0, 2)) console.log(`   [${f.kind}/${f.key}] ${f.detail}\n   marks ${f.m}`); }
if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 3));
await browser.close(); process.exit(rules.length || errs.length ? 1 : 0);
