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
  browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
});
after(async () => { if(browser) await browser.close(); });

async function withPage(fn, setup){
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  try{
    await page.goto(url, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__MSC_GPA__);
    if(setup){
      await setup(page);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => window.__MSC_GPA__);
    }
    await fn(page);
    assert.deepEqual(errors, []);
  }finally{
    await ctx.close();
  }
}

test('preserves the calculator contract on a fresh visit', async () => {
  await withPage(async page => {
    const info = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      const st = g.getState();
      const headings = [...document.querySelectorAll('h2')].map(h => h.id);
      return {
        mt: st.marks.ipa.mt,
        fin: st.marks.ipa.fin,
        part: st.marks.ipa.part,
        pct: document.getElementById('o-pct').textContent,
        gpa: document.getElementById('ov-gpa').textContent,
        closed: [...document.querySelectorAll('details')].every(d => !d.open),
        effort: document.getElementById('show-effort').checked,
        effortText: document.querySelector('details.explain').textContent,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        main: document.querySelectorAll('main').length,
        actions: document.querySelector('#course-body').closest('table').querySelector('th .sr').textContent,
        headings,
        exact: document.body.textContent.includes('Exact'),
        extrapolated: document.body.textContent.includes('Extrapolated'),
        sliders: [...document.querySelectorAll('input[type=range]')].map(el => el.id),
        title: document.querySelector('h1').textContent,
        method: document.getElementById('h-method').textContent
      };
    });
    assert.equal(info.mt, null);
    assert.equal(info.fin, 70);
    assert.equal(info.part, 100);
    assert.match(info.pct, /^\d+\.\d{2}–\d+\.\d{2}%$/);
    assert.match(info.gpa, /^\d+\.\d{2}–\d+\.\d{2}$/);
    assert.equal(info.closed, true);
    assert.equal(info.effort, false);
    assert.match(info.effortText, /illustrative/i);
    assert.match(info.scheme, /dark/);
    assert.equal(info.main, 1);
    assert.equal(info.actions, 'Actions');
    assert.deepEqual(info.headings.at(-1), 'h-method');
    assert.ok(info.headings.indexOf('h-trajectory') < info.headings.indexOf('h-method'));
    assert.equal(info.exact, true);
    assert.equal(info.extrapolated, true);
    assert.deepEqual(info.sliders, ['in-fin-range','chart-exam']);
    assert.equal(info.title, 'GPA calculator');
    assert.equal(info.method, 'How the cutoffs work');
  });
});

test('grades official boundaries without treating a near miss as the next grade', async () => {
  await withPage(async page => {
    const rows = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      return g.getState().cuts.map(c => ({
        at: g.gradeFor(c.cut).g,
        justBelow: g.gradeFor(c.cut - 0.001).g,
        noise: g.gradeFor(c.cut - 1e-10).g,
        letter: c.g
      }));
    });
    for(const row of rows){
      assert.equal(row.at, row.letter);
      assert.equal(row.noise, row.letter);
      if(row.letter !== 'F') assert.notEqual(row.justBelow, row.letter);
    }
    const shown = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      g.setMark('ipa','part',100);
      g.setMark('ipa','asg',100);
      g.setMark('ipa','mt',30);
      g.setMark('ipa','fin', (79.996 - 65) / 35 * 100);
      g.renderInputs();
      g.update();
      return {
        grade: g.gradeFor(g.compute('ipa').total).g,
        pct: document.getElementById('o-pct').textContent,
        sub: document.getElementById('o-pct-s').textContent,
        letter: document.getElementById('o-letter').textContent
      };
    });
    assert.equal(shown.grade, 'B-');
    assert.equal(shown.pct, '79.99%');
    assert.equal(shown.letter, 'B\u2212');
    assert.match(shown.sub, /0\.004 pts below B/);
    assert.doesNotMatch(shown.sub, /0\.00 pts/);
  });
});

test('blank components stay unknown and zero is included', async () => {
  await withPage(async page => {
    const blank = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#need-body tr')].find(tr => tr.children[0].textContent === 'B');
      return {pct: document.getElementById('o-pct').textContent, need: row.children[3].textContent};
    });
    assert.match(blank.pct, /–/);
    assert.equal(blank.need, '42.86–100.00%');

    const zero = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      g.setMark('ipa','mt', 0);
      g.update();
      const row = [...document.querySelectorAll('#need-body tr')].find(tr => tr.children[0].textContent === 'B');
      return {
        pct: document.getElementById('o-pct').textContent,
        letter: document.getElementById('o-letter').textContent,
        need: row.children[3].textContent,
        total: g.compute('ipa').total
      };
    });
    assert.equal(zero.total, 69.5);
    assert.equal(zero.pct, '69.50%');
    assert.equal(zero.letter, 'C+');
    assert.equal(zero.need, '100.00%');
  });
});

test('weights GPA by included units, keeps F, and drops blanks', async () => {
  await withPage(async page => {
    const math = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      const both = g.gpaFromItems([
        {units:3, complete:true, gp:4, pct:96},
        {units:3, complete:true, gp:0, pct:0},
        {units:3, excluded:true},
        {units:0, complete:true, gp:4, pct:100}
      ]);
      const range = g.gpaFromItems([
        {units:3, complete:false, gpMin:2, gpMax:4, minPct:50, maxPct:95},
        {units:3, complete:true, gp:3, pct:80}
      ]);
      return {both, range};
    });
    assert.equal(math.both.units, 6);
    assert.equal(math.both.gpa, 2);
    assert.equal(math.range.gpaMin, 2.5);
    assert.equal(math.range.gpaMax, 3.5);

    const dom = await page.evaluate(() => {
      const setUnits = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input', {bubbles:true}));
      };
      setUnits('lu-ipa','0');
      setUnits('lu-afm','0');
      document.getElementById('add-course').click();
      const blank = document.getElementById('ov-gpa').textContent;
      const score = document.getElementById('cv-0');
      score.value = '0';
      score.dispatchEvent(new Event('change', {bubbles:true}));
      const zero = document.getElementById('ov-gpa').textContent;
      score.value = '150';
      score.dispatchEvent(new Event('change', {bubbles:true}));
      const clamped = {value: score.value, gpa: document.getElementById('ov-gpa').textContent, letter: document.getElementById('cl-0').textContent};
      document.getElementById('cm-0').value = 'exclude';
      document.getElementById('cm-0').dispatchEvent(new Event('change', {bubbles:true}));
      const excluded = document.getElementById('ov-gpa').textContent;
      document.getElementById('add-course').click();
      document.getElementById('cm-1').value = 'letter';
      document.getElementById('cm-1').dispatchEvent(new Event('change', {bubbles:true}));
      document.getElementById('cv-1').value = 'F';
      document.getElementById('cv-1').dispatchEvent(new Event('change', {bubbles:true}));
      const fail = document.getElementById('ov-gpa').textContent;
      document.getElementById('add-course').click();
      document.getElementById('cm-2').value = 'letter';
      document.getElementById('cm-2').dispatchEvent(new Event('change', {bubbles:true}));
      document.getElementById('cv-2').value = 'A';
      document.getElementById('cv-2').dispatchEvent(new Event('change', {bubbles:true}));
      return {blank, zero, clamped, excluded, fail, mixed: document.getElementById('ov-gpa').textContent};
    });
    assert.equal(dom.blank, '–');
    assert.equal(dom.zero, '0.00');
    assert.equal(dom.clamped.value, '100');
    assert.equal(dom.clamped.letter, 'A');
    assert.equal(dom.clamped.gpa, '4.00');
    assert.equal(dom.excluded, '–');
    assert.equal(dom.fail, '0.00');
    assert.equal(dom.mixed, '2.00');
  });
});

test('keeps the final number, both sliders, and the chart label together', async () => {
  await withPage(async page => {
    await page.setViewport({width:1280, height:900});
    const typed = await page.evaluate(() => {
      const el = document.getElementById('in-fin');
      el.value = '64.25';
      el.dispatchEvent(new Event('input', {bubbles:true}));
      return {
        mark: window.__MSC_GPA__.getState().marks.ipa.fin,
        range: document.getElementById('in-fin-range').value,
        chart: document.getElementById('chart-exam').value,
        out: document.getElementById('chart-exam-value').textContent
      };
    });
    assert.equal(typed.mark, 64.25);
    assert.equal(typed.range, '64.25');
    assert.equal(typed.chart, '64.25');
    assert.equal(typed.out, '64.25%');

    const cleared = await page.evaluate(() => {
      const el = document.getElementById('in-fin');
      el.value = '';
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
      return {
        mark: window.__MSC_GPA__.getState().marks.ipa.fin,
        out: document.getElementById('chart-exam-value').textContent,
        readout: document.getElementById('chart-readout').innerText,
        rangeAria: document.getElementById('in-fin-range').getAttribute('aria-valuetext'),
        chartAria: document.getElementById('chart-exam').getAttribute('aria-valuetext'),
        rangeBlank: document.getElementById('in-fin-range').dataset.blank,
        chartBlank: document.getElementById('chart-exam').dataset.blank
      };
    });
    assert.equal(cleared.mark, null);
    assert.equal(cleared.out, 'Not entered');
    assert.match(cleared.readout, /Not entered/);
    assert.doesNotMatch(cleared.readout, /50\.00%/);
    assert.equal(cleared.rangeAria, 'Not entered');
    assert.equal(cleared.chartAria, 'Not entered');
    assert.equal(cleared.rangeBlank, 'true');
    assert.equal(cleared.chartBlank, 'true');

    const zero = await page.evaluate(() => {
      const el = document.getElementById('in-fin');
      el.value = '0';
      el.dispatchEvent(new Event('input', {bubbles:true}));
      return {
        mark: window.__MSC_GPA__.getState().marks.ipa.fin,
        out: document.getElementById('chart-exam-value').textContent,
        blank: document.getElementById('chart-exam').dataset.blank || ''
      };
    });
    assert.equal(zero.mark, 0);
    assert.equal(zero.out, '0.00%');
    assert.equal(zero.blank, '');

    const fromSlider = await page.evaluate(() => {
      const slider = document.getElementById('in-fin-range');
      slider.value = '82';
      slider.dispatchEvent(new Event('input', {bubbles:true}));
      return {
        mark: window.__MSC_GPA__.getState().marks.ipa.fin,
        num: document.getElementById('in-fin').value,
        chart: document.getElementById('chart-exam').value,
        out: document.getElementById('chart-exam-value').textContent,
        mt: window.__MSC_GPA__.getState().marks.ipa.mt
      };
    });
    assert.equal(fromSlider.mark, 82);
    assert.equal(fromSlider.num, '82');
    assert.equal(fromSlider.chart, '82');
    assert.equal(fromSlider.out, '82.00%');
    assert.equal(fromSlider.mt, null);
  });
});

test('chart keyboard, hover, and touch stay aligned with the saved final', async () => {
  await withPage(async page => {
    await page.setViewport({width:1280, height:900});
    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','fin',70.3);
      window.__MSC_GPA__.renderInputs();
      window.__MSC_GPA__.update();
      document.getElementById('trajectory').focus();
    });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin), 70.5);
    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','fin',70.3);
      window.__MSC_GPA__.update();
      document.getElementById('trajectory').focus();
    });
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin), 70);
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin), 0);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin), 100);

    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','fin', null);
      window.__MSC_GPA__.renderInputs();
      window.__MSC_GPA__.update();
      document.getElementById('trajectory').focus();
    });
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin), 50);

    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','fin',70);
      window.__MSC_GPA__.renderInputs();
      window.__MSC_GPA__.update();
      document.getElementById('h-trajectory').scrollIntoView({block:'center'});
    });
    const box = await page.$eval('#trajectory', el => {
      const r = el.getBoundingClientRect();
      return {x:r.x, y:r.y, w:r.width, h:r.height};
    });
    await page.mouse.move(box.x + 24, box.y + box.h / 2);
    const hover = await page.$eval('#chart-readout', el => el.innerText);
    await page.mouse.move(4, 4);
    const left = await page.$eval('#chart-readout', el => el.innerText);
    const mark = await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.fin);
    assert.match(hover, /Preview/);
    assert.match(left, /70\.00%/);
    assert.match(left, /Both courses at this final score/);
    assert.equal(mark, 70);

    const touch = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      g.setMark('ipa','fin',70);
      g.renderInputs();
      g.update();
      const plot = document.getElementById('trajectory');
      const r = plot.getBoundingClientRect();
      const fire = (type, x, y) => plot.dispatchEvent(new PointerEvent(type, {
        bubbles:true, button:0, pointerId:3, pointerType:'touch', clientX:x, clientY:y, isPrimary:true
      }));
      const before = g.getState().marks.ipa.fin;
      fire('pointerdown', r.left + r.width * 0.7, r.top + 80);
      fire('pointermove', r.left + r.width * 0.7, r.top + 200);
      fire('pointerup', r.left + r.width * 0.7, r.top + 200);
      const afterVertical = g.getState().marks.ipa.fin;
      fire('pointerdown', r.left + 40, r.top + 80);
      fire('pointermove', r.left + 220, r.top + 84);
      fire('pointerup', r.left + 220, r.top + 84);
      return {before, afterVertical, afterHorizontal: g.getState().marks.ipa.fin};
    });
    assert.equal(touch.before, 70);
    assert.equal(touch.afterVertical, 70);
    assert.notEqual(touch.afterHorizontal, 70);
  });
});

test('migrates saved marks without dropping real scores or bad storage', async () => {
  await withPage(async page => {
    await page.evaluate(() => {
      localStorage.removeItem('cuhk-gpa-v4');
      localStorage.setItem('cuhk-gpa-v3', JSON.stringify({
        active:'afm',
        marks:{ipa:{part:'91', asg:80, mt:16, fin:75}, afm:{part:70, grp:88, crit1:82.5, crit2:82.5, crit3:82.5, crit4:82.5, fin:60}},
        cuts:['95','90','85','80','70','60','50','40','30','20','0'],
        others:[{name:'Ethics', units:3, mode:'exclude', value:'P'}],
        units:{ipa:3, afm:1.5}
      }));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__MSC_GPA__);
    const migrated = await page.evaluate(() => {
      const st = window.__MSC_GPA__.getState();
      return {
        active: st.active,
        part: st.marks.ipa.part,
        mt: st.marks.ipa.mt,
        fin: st.marks.ipa.fin,
        afm: st.marks.afm.part,
        units: st.units,
        cuts: st.cuts.map(c => c.cut),
        others: st.others,
        cleared: st.clearedDefaultMidterm,
        v3: localStorage.getItem('cuhk-gpa-v3') !== null
      };
    });
    assert.equal(migrated.active, 'afm');
    assert.equal(migrated.part, 91);
    assert.equal(migrated.mt, null);
    assert.equal(migrated.fin, 75);
    assert.equal(migrated.afm, 70);
    assert.equal(migrated.units.afm, 1.5);
    assert.equal(migrated.cuts[0], 95);
    assert.equal(migrated.others[0].mode, 'exclude');
    assert.equal(migrated.cleared, true);
    assert.equal(migrated.v3, true);

    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','mt',16);
      window.__MSC_GPA__.save();
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__MSC_GPA__);
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().marks.ipa.mt), 16);
  });

  await withPage(async page => {
    await page.evaluate(() => {
      localStorage.setItem('cuhk-gpa-v4', JSON.stringify({
        clearedDefaultMidterm:true,
        marks:{ipa:{part:'91', asg:'', mt:'0', fin:'64.5'}},
        cuts:[1,2,3]
      }));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__MSC_GPA__);
    const kept = await page.evaluate(() => {
      const st = window.__MSC_GPA__.getState();
      return {part: st.marks.ipa.part, asg: st.marks.ipa.asg, mt: st.marks.ipa.mt, fin: st.marks.ipa.fin, cut: st.cuts[0].cut};
    });
    assert.equal(kept.part, 91);
    assert.equal(kept.asg, null);
    assert.equal(kept.mt, 0);
    assert.equal(kept.fin, 64.5);
    assert.equal(kept.cut, 95);
  });

  await withPage(async page => {
    await page.evaluate(() => localStorage.setItem('cuhk-gpa-v4', '{'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__MSC_GPA__);
    await page.evaluate(() => {
      window.__MSC_GPA__.setMark('ipa','fin', 12);
      window.__MSC_GPA__.save();
    });
    const stored = await page.evaluate(() => ({
      raw: localStorage.getItem('cuhk-gpa-v4'),
      note: document.getElementById('storage-note').textContent
    }));
    assert.equal(stored.raw, '{');
    assert.match(stored.note, /will not overwrite/);
  });
});

test('reports a partly blank critique group instead of hiding it', async () => {
  await withPage(async page => {
    const text = await page.evaluate(() => {
      const g = window.__MSC_GPA__;
      g.setActive('afm');
      g.setMark('afm','crit2', null);
      g.update();
      return document.getElementById('o-break').textContent;
    });
    assert.match(text, /critiques not entered \(5%\)/);
    assert.match(text, /12\.38 critiques/);
  });
});

function contrastRatio(a, b){
  const lum = rgb => {
    const m = String(rgb).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if(!m) return null;
    const lin = [m[1], m[2], m[3]].map(v => {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  };
  const L1 = lum(a), L2 = lum(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

async function tabFace(page, id){
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const mark = getComputedStyle(el, '::before');
    const opaque = node => {
      while(node){
        const bg = getComputedStyle(node).backgroundColor;
        const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if(m && (m[4]===undefined || Number(m[4]) > 0.95)) return bg;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    return {
      checked: el.getAttribute('aria-checked'),
      pressed: el.getAttribute('aria-pressed'),
      role: el.getAttribute('role'),
      group: document.getElementById('tabs').getAttribute('role'),
      bg: opaque(el),
      color: cs.color,
      weight: Number(cs.fontWeight),
      mark: mark.borderBottomWidth,
      label: el.textContent
    };
  }, id);
}

test('selected course is visible without relying on color alone', async () => {
  await withPage(async page => {
    await page.setViewport({width:1280, height:800});
    const ipa = await tabFace(page, '#tab-ipa');
    const afm = await tabFace(page, '#tab-afm');
    assert.equal(ipa.group, 'radiogroup');
    assert.equal(ipa.role, 'radio');
    assert.equal(afm.role, 'radio');
    assert.equal(ipa.checked, 'true');
    assert.equal(afm.checked, 'false');
    assert.equal(ipa.pressed, null);
    assert.notEqual(ipa.bg, afm.bg);
    assert.equal(ipa.mark, '2px');
    assert.equal(afm.mark, '0px');
    assert.ok(ipa.weight >= 700);
    assert.ok(afm.weight < 700);
    assert.ok(contrastRatio(ipa.color, ipa.bg) >= 4.5, `selected contrast ${contrastRatio(ipa.color, ipa.bg)}`);
    assert.ok(contrastRatio(afm.color, afm.bg) >= 4.5, `idle contrast ${contrastRatio(afm.color, afm.bg)}`);
    assert.match(await page.evaluate(() => document.getElementById('h-course').textContent), /IPA 6112/);
    const ipaRow = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#course-body tr')].find(tr => tr.textContent.includes('IPA 6112'));
      const mark = getComputedStyle(row.querySelector('strong'), '::before');
      return {active: row.classList.contains('active-course'), mark: mark.borderBottomWidth};
    });
    assert.equal(ipaRow.active, true);
    assert.equal(ipaRow.mark, '2px');

    await page.click('#tab-afm');
    const picked = await tabFace(page, '#tab-afm');
    const idle = await tabFace(page, '#tab-ipa');
    assert.equal(picked.checked, 'true');
    assert.equal(picked.mark, '2px');
    assert.equal(idle.checked, 'false');
    assert.equal(idle.mark, '0px');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().active), 'afm');
    assert.match(await page.evaluate(() => document.getElementById('h-course').textContent), /AFM 6092/);
    assert.ok(contrastRatio(picked.color, picked.bg) >= 4.5);

    await page.focus('#tab-afm');
    await page.keyboard.press('ArrowLeft');
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      return {id: el.id, checked: el.getAttribute('aria-checked'), outline: cs.outlineStyle, width: parseFloat(cs.outlineWidth)};
    });
    assert.equal(focus.id, 'tab-ipa');
    assert.equal(focus.checked, 'true');
    assert.notEqual(focus.outline, 'none');
    assert.ok(focus.width >= 2);

    for(const width of [375, 320]){
      await page.setViewport({width, height:740, isMobile:true, hasTouch:true, deviceScaleFactor:1});
      const box = await page.evaluate(() => {
        const doc = document.documentElement;
        const tabs = [...document.querySelectorAll('#tabs button')];
        const selected = document.querySelector('#tabs button[aria-checked="true"]');
        const mark = getComputedStyle(selected, '::before').borderBottomWidth;
        return {
          scroll: doc.scrollWidth,
          client: doc.clientWidth,
          left: Math.min(...tabs.map(t => t.getBoundingClientRect().left)),
          right: Math.max(...tabs.map(t => t.getBoundingClientRect().right)),
          mark,
          both: tabs.length
        };
      });
      assert.equal(box.both, 2);
      assert.ok(box.scroll <= box.client + 1, `page overflow at ${width}: ${box.scroll} > ${box.client}`);
      assert.ok(box.left >= -1, `tabs start at ${box.left}`);
      assert.ok(box.right <= box.client + 1, `tabs end at ${box.right}`);
      assert.equal(box.mark, '2px');
    }
  });
});

test('course tabs respond to arrows and a narrow screen stays inside the viewport', async () => {
  await withPage(async page => {
    await page.setViewport({width:1280, height:800});
    await page.focus('#tab-ipa');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().active), 'afm');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => window.__MSC_GPA__.getState().active), 'ipa');

    await page.setViewport({width:320, height:740, isMobile:true, hasTouch:true, deviceScaleFactor:1});
    const narrow = await page.evaluate(() => {
      const doc = document.documentElement;
      const text = document.querySelector('#trajectory text');
      const shell = document.querySelector('.chart-shell');
      return {
        scroll: doc.scrollWidth,
        client: doc.clientWidth,
        cols: getComputedStyle(document.getElementById('chart-readout')).gridTemplateColumns,
        textH: text.getBoundingClientRect().height,
        shellScroll: shell.scrollWidth,
        shellClient: shell.clientWidth,
        input: getComputedStyle(document.getElementById('in-part')).fontSize,
        mini: getComputedStyle(document.querySelector('.mini-result')).display
      };
    });
    assert.ok(narrow.scroll <= narrow.client + 1);
    assert.equal(narrow.cols.split(' ').length, 1);
    assert.ok(narrow.textH >= 11, `chart text height ${narrow.textH}`);
    assert.ok(narrow.shellScroll > narrow.shellClient);
    assert.equal(narrow.input, '16px');
    assert.equal(narrow.mini, 'flex');

    await page.setViewport({width:1280, height:800});
    const desktop = await page.evaluate(() => {
      const shell = document.querySelector('.chart-shell');
      return {scroll: shell.scrollWidth, client: shell.clientWidth, cols: getComputedStyle(document.getElementById('chart-readout')).gridTemplateColumns.split(' ').length};
    });
    assert.ok(desktop.scroll <= desktop.client + 2);
    assert.equal(desktop.cols, 3);
  });
});
