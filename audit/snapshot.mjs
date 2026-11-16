// Refactor guard: renders N seeded states and prints a hash of everything the UI paints, so a refactor can be proven output-identical.
// usage: node snapshot.mjs index.html > out.json     compare two outputs with diff / cmp
import { createRequire } from 'module';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.goto('file://' + process.argv[2]); await p.waitForFunction(() => window.__MSC_GPA__);
const out = await p.evaluate(() => {
  let s = 12345; const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const G = window.__MSC_GPA__, $ = id => document.getElementById(id), fire = (el, t) => el.dispatchEvent(new Event(t, { bubbles: true }));
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const ids = ['o-pct', 'o-pct-s', 'o-letter', 'o-letter-s', 'o-gp', 'o-break', 'need-intro', 'need-body', 'ladder', 'course-body', 'ov-gpa', 'ov-letter', 'ov-letter-s', 'ov-pct', 'ov-pct-s', 'plot-content', 'plot-hover', 'chart-readout', 'chart-exam-value'];
  const out = [];
  for (let i = 0; i < 700; i++) {
    const k = rnd() < 0.5 ? 'ipa' : 'afm'; G.setActive(k);
    for (const kk of ['ipa', 'afm']) for (const id in G.COURSES[kk].comps.reduce((a, c) => (a[c.id] = 1, a), {})) { const mx = id === 'mt' ? 30 : 100; G.setMark(kk, id, rnd() < 0.15 ? null : Math.round(rnd() * mx * (rnd() < .5 ? 1 : 100)) / (rnd() < .5 ? 1 : 100)); }
    while ($('cx-0')) $('cx-0').click();
    const n = Math.floor(rnd() * 3); for (let j = 0; j < n; j++) { $('add-course').click(); const cm = $('cm-' + j); cm.value = ['pct', 'letter', 'exclude'][Math.floor(rnd() * 3)]; fire(cm, 'change'); const cv = $('cv-' + j); if (cm.value === 'pct') cv.value = String(Math.round(rnd() * 12000) / 100); else if (cm.value === 'letter') cv.value = ['A', 'B+', 'C', 'F'][Math.floor(rnd() * 4)]; fire(cv, 'change'); }
    G.update(); G.readout(rnd() * 100);
    out.push(hash(ids.map(id => $(id).innerHTML).join('|')));
  }
  return out;
});
console.log(JSON.stringify(out)); await b.close();
