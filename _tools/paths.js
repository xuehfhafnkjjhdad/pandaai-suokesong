const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8787/';
const OUT = 'E:/pandaAI/shots';

// 按 action id 点，避免三关按钮顺序不同导致"点了同一个下标却是不同动作"
const PATHS = [
  { name: '纪律型', probes: 3, ids: ['S1_LIGHT', 'S2_HALF', 'S3_STOP'] },
  { name: '追涨型', probes: 0, ids: ['S1_HEAVY', 'S2_ADD', 'S3_AVG'] },
  { name: '保守型', probes: 3, ids: ['S1_WAIT', 'S2_PASS', 'S3_AGAIN'] },
];

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  for (const p of PATHS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL, { waitUntil: 'load' });
    await page.click('#startBtn');
    await page.waitForTimeout(600);
    for (let s = 0; s < 3; s++) {
      const probes = await page.$$('#probes .probe');
      for (let k = 0; k < Math.min(p.probes, probes.length); k++) { await probes[k].click(); await page.waitForTimeout(60); }
      const ok = await page.evaluate((id) => {
        const st = window.PD.stages.find(x => x.id === document.querySelector('#stageName').textContent);
        const all = [].concat(st.actions.default || [], st.actions.holding || [], st.actions.empty || []);
        const a = all.find(x => x.id === id);
        if (!a) return false;
        const btns = [...document.querySelectorAll('#actions .act')];
        const b = btns.find(b => b.textContent === a.label);
        if (!b) return false;
        b.click();
        return true;
      }, p.ids[s]);
      if (!ok) console.log('!! 没找到按钮', p.ids[s]);
      await page.waitForTimeout(3400);
    }
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => ({
      xian: document.querySelector('.xian b').textContent,
      stage: document.querySelector('.xian span').textContent,
      kad: document.querySelector('.kadname').textContent,
      top: [...document.querySelectorAll('.wrow')].map(w => w.children[1].textContent + w.querySelector('.pct').textContent).join(' '),
      filled: [...document.querySelectorAll('#resultField .plot')].filter(pl => pl.querySelector('.fruit.on')).length,
      holes: document.querySelectorAll('#resultField .hole.on').length,
    }));
    console.log(p.name, '→', JSON.stringify(r, null, 0));
    await page.screenshot({ path: OUT + '/path-' + p.name + '.png' });
    await page.close();
  }
  await browser.close();
})();
