import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const url = new URL('../index.html', import.meta.url).href;

function findChrome(){
  if(process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if(process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    try{ return execFileSync('which', [name], {encoding:'utf8'}).trim(); }catch{ /* try the next name */ }
  }
  throw new Error('Set CHROME_PATH to a Chrome or Chromium binary.');
}

let browser;
before(async () => {
  browser = await puppeteer.launch({executablePath: findChrome(), headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
});
after(async () => { if(browser) await browser.close(); });

// Fresh browser context per test; fails on any page error. `seed` writes localStorage before the app loads.
async function withPage(fn, {seed, viewport} = {}){
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  if(viewport) await page.setViewport(viewport);
  try{
    if(seed) await page.evaluateOnNewDocument(s => localStorage.setItem('cuhk-gpa-v4', s), JSON.stringify(seed));
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__GPA__);
    await fn(page);
    assert.deepEqual(errors, []);
  }finally{ await ctx.close(); }
}
const set = (page, key, id, v) => page.evaluate((k, i, x) => { window.__GPA__.marks[k][i] = x; window.__GPA__.update(); }, key, id, v);
const text = (page, sel) => page.$eval(sel, e => e.textContent.trim());

test('fresh visit is blank, carries no marks, and needs no score above 100%', async () => {
  await withPage(async page => {
    const s = await page.evaluate(() => ({
      marks: JSON.stringify(window.__GPA__.marks),
      letter: document.getElementById('r-letter').textContent,
      goal: document.getElementById('goal-v').textContent,
      need: [...document.querySelectorAll('#need td:last-child .pill')].map(e => e.textContent),
      gpa: document.getElementById('t-gpa').textContent,
      title: document.querySelector('h1').textContent
    }));
    assert.ok(!/\d/.test(s.marks.replace(/"(ipa|afm|part|asg|mt|fin|grp|crit\d)"/g, '')), 'no numeric marks are pre-filled');
    assert.equal(s.letter, '–');
    assert.equal(s.goal, '–');
    assert.equal(s.gpa, '–');
    assert.equal(s.title, 'GPA calculator');
    for(const t of s.need) for(const n of t.match(/\d+(?:\.\d+)?/g) || []) assert.ok(Number(n) <= 100, `over 100%: ${t}`);
  });
});

test('grades at exact cutoffs and never lets rounding cross one', async () => {
  await withPage(async page => {
    // 0 + 35 (assignments 100) + 10 (participation 100) + 0 midterm + 35 final = 80 exactly.
    const r = await page.evaluate(() => {
      const g = window.__GPA__, m = g.marks.ipa;
      Object.assign(m, {part:100, asg:100, mt:0, fin:100}); g.update();
      const exact = {letter:g.gradeFor(g.compute('ipa').lo).g, shown:g.showPct(g.compute('ipa').lo)};
      m.asg = 99.99; g.update();
      const near = {letter:g.gradeFor(g.compute('ipa').lo).g, shown:g.showPct(g.compute('ipa').lo), ui:document.getElementById('r-score').textContent};
      return {exact, near};
    });
    assert.deepEqual(r.exact, {letter:'B', shown:'80.00'});
    assert.equal(r.near.letter, 'B-');
    assert.equal(r.near.shown, '79.99');
    assert.equal(r.near.ui, '79.99%');
  });
});

test('blank is unknown and zero is a real score', async () => {
  await withPage(async page => {
    await page.evaluate(() => { const m = window.__GPA__.marks.ipa; Object.assign(m, {part:100, asg:100, fin:70}); window.__GPA__.update(); });
    const blank = await text(page, '#r-score');
    assert.match(blank, /^\d+\.\d{2}–\d+\.\d{2}%$/, 'blank midterm gives a range');
    await set(page, 'ipa', 'mt', 0);
    assert.equal(await text(page, '#r-score'), '69.50%'); // 10 + 35 + 0 + 24.5
    assert.equal(await text(page, '#r-letter'), 'C+');
  });
});

test('needed final rounds up so the shown score really reaches the grade', async () => {
  await withPage(async page => {
    const r = await page.evaluate(() => {
      const g = window.__GPA__, m = g.marks.ipa; Object.assign(m, {part:100, asg:100, mt:16, fin:null}); g.update();
      const res = g.compute('ipa'), B = g.cuts.find(c => c.g === 'B').cut;
      const exact = (B - res.banked) / res.fw * 100;                 // 69.5238...
      const shown = Number(g.needLabel(res, B)[0].replace('%', ''));  // 69.53
      const total = x => res.banked + res.fw * x / 100;
      return {exact, shown, reaches: g.gradeFor(total(shown)).g, shortAtTruncated: g.gradeFor(total(69.52)).g,
              ui: document.getElementById('goal-v').textContent};
    });
    assert.ok(Math.abs(r.exact - 69.5238) < 1e-3);
    assert.equal(r.shown, 69.53);
    assert.equal(r.reaches, 'B');
    assert.equal(r.shortAtTruncated, 'B-');
    assert.equal(r.ui, '69.53%');
  });
});

test('needed score handles secured, out of reach and ranges', async () => {
  await withPage(async page => {
    const r = await page.evaluate(() => {
      const g = window.__GPA__, m = g.marks.ipa;
      Object.assign(m, {part:100, asg:100, mt:30, fin:null}); g.update();     // banked 65, final worth 35
      const exact = ['A','C+','D'].map(x => g.needLabel(g.compute('ipa'), g.cuts.find(c => c.g === x).cut)[0]);
      Object.assign(m, {part:100, asg:100, mt:null, fin:null}); g.update();   // midterm unknown
      const range = g.needLabel(g.compute('ipa'), 80)[0];
      return {exact, range};
    });
    assert.deepEqual(r.exact, ['85.72%', 'Secured', 'Secured']); // (95-65)/.35 = 85.714 rounds up
    assert.equal(r.range, '42.86–100.00%'); // best case (80-65)/.35 = 42.857 up; worst case (80-45)/.35 = 100
  });
});

test('overall GPA is unit-weighted and leaves out P, blanks and unmarked courses', async () => {
  await withPage(async page => {
    const r = await page.evaluate(() => {
      const g = window.__GPA__, m = g.marks.ipa;
      Object.assign(m, {part:100, asg:100, mt:30, fin:100}); // 100% -> A (4.0)
      g.units.ipa = 3; g.units.afm = 3;
      g.others.push({name:'FIN A', units:3, mode:'letter', value:'B'});
      g.others.push({name:'FIN B', units:1, mode:'pct', value:'45'});    // C- 1.7
      g.others.push({name:'Pass', units:3, mode:'letter', value:'P'});
      g.others.push({name:'Blank', units:3, mode:'pct', value:''});
      g.buildCourses(); g.update();
      return {gpa: document.getElementById('t-gpa').textContent, pct: document.getElementById('t-pct').textContent};
    });
    // (3*4.0 + 3*3.0 + 1*1.7) / 7 = 3.2429 ; AFM has no marks so it is excluded
    assert.equal(r.gpa, '3.24');
    assert.equal(r.pct, '86.25%'); // only percent-based items: (3*100 + 1*45) / 4
  });
});

test('a saved state loads exactly and a score is never snapped to a grid', async () => {
  await withPage(async page => {
    const s = await page.evaluate(() => ({fin: window.__GPA__.marks.ipa.fin, input: document.getElementById('in-fin').value, active: window.__GPA__.active}));
    assert.deepEqual(s, {fin:70.3, input:'70.3', active:'ipa'});
  }, {seed:{active:'ipa', marks:{ipa:{part:90, asg:85, mt:21, fin:70.3}, afm:{}}, units:{ipa:3, afm:3}}});
});

test('chart click, drag and arrow keys set the final exactly', async () => {
  await withPage(async page => {
    await page.$eval('#chart', e => e.scrollIntoView({block:'center'}));
    const box = await page.$eval('#chart', e => { const r = e.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; });
    const geo = await page.evaluate(() => window.__GPA__.geo());
    const px = pct => box.x + (geo.ML + pct / 100 * geo.PW) / geo.W * box.w;
    await page.mouse.click(px(62.3), box.y + box.h / 2);
    const clicked = await page.evaluate(() => window.__GPA__.marks.ipa.fin);
    assert.ok(Math.abs(clicked - 62.3) < 0.2, `clicked ${clicked}`);
    assert.notEqual(clicked % 0.5, 0, 'not snapped to a half-point grid');
    await page.evaluate(() => { window.__GPA__.marks.ipa.fin = 70.3; window.__GPA__.update(); document.getElementById('chart').focus(); });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__GPA__.marks.ipa.fin), 71.3);
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => window.__GPA__.marks.ipa.fin), 71.2);
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => window.__GPA__.marks.ipa.fin), 0);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => window.__GPA__.marks.ipa.fin), 100);
  }, {viewport:{width:1100, height:1200}});
});

test('chart steps sit at the exact needed scores', async () => {
  await withPage(async page => {
    // banked 65 (IPA, all coursework full): B needs 42.857%, so the grade jumps to B at x = 42.857.
    const jump = await page.evaluate(() => {
      const g = window.__GPA__; Object.assign(g.marks.ipa, {part:100, asg:100, mt:30, fin:null}); g.update();
      const path = document.querySelector('#chart .ln').getAttribute('d');
      const xs = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(m => [+m[1], +m[2]]);
      const o = g.geo(), Y = gp => o.MT + (1 - gp / 4) * o.PH, X = v => o.ML + v / 100 * o.PW;
      const b = xs.find(([x, y]) => Math.abs(y - Y(3.0)) < 0.2);
      return {x: b[0], expect: X(42.857)};
    });
    assert.ok(Math.abs(jump.x - jump.expect) < 0.2, `${jump.x} vs ${jump.expect}`);
  });
});

test('cutoff edits are validated and change grades', async () => {
  await withPage(async page => {
    await page.evaluate(() => { const m = window.__GPA__.marks.ipa; Object.assign(m, {part:100, asg:100, mt:0, fin:100}); window.__GPA__.update(); });
    assert.equal(await text(page, '#r-letter'), 'B'); // 80
    await page.evaluate(() => { document.querySelector('details').open = true; });
    await page.$eval('[data-i="3"]', el => { el.value = '82'; el.dispatchEvent(new Event('input', {bubbles:true})); });
    assert.equal(await text(page, '#r-letter'), 'B−'); // B now needs 82
    await page.$eval('[data-i="3"]', el => { el.value = '96'; el.dispatchEvent(new Event('input', {bubbles:true})); }); // above A-: invalid
    assert.equal(await page.$eval('[data-i="3"]', el => el.getAttribute('aria-invalid')), 'true');
    assert.equal(await page.evaluate(() => window.__GPA__.cuts[3].cut), 82, 'invalid edit is not committed');
  });
});

test('layout fits a phone and keyboard order reaches the marks first', async () => {
  await withPage(async page => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.keyboard.press('Tab'); // first control: the checked course radio
    assert.equal(await page.evaluate(() => document.activeElement.name), 'course');
  }, {viewport:{width:375, height:812}});
});
