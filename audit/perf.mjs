import { createRequire } from 'module';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
for (const f of process.argv.slice(2)) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 }); await p.goto('file://' + f); await p.waitForFunction(() => window.__MSC_GPA__);
  const r = await p.evaluate(async () => {
    const G = window.__MSC_GPA__, $ = id => document.getElementById(id);
    G.setActive('ipa'); for (const id of ['part', 'asg', 'mt']) G.setMark('ipa', id, 80); G.setMark('afm', 'fin', null);
    for (let i = 0; i < 3; i++) $('add-course').click();
    const t = (fn, n) => { const a = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - a) / n; };
    G.update(); const upd = t(() => G.update(), 300);
    const svg = $('trajectory'), r = svg.getBoundingClientRect();
    const mv = t(i => svg.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + 80 + (i * 3) % (r.width - 160), clientY: r.top + 100, bubbles: true })), 300);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { update_ms: +upd.toFixed(3), pointermove_ms: +mv.toFixed(3) };
  });
  console.log(f.split('/').slice(-1)[0].padEnd(16), JSON.stringify(r)); await p.close();
}
await b.close();
