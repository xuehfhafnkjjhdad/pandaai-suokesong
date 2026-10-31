const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8787/';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(URL, { waitUntil: 'load' });
  await page.click('#startBtn');
  await page.waitForTimeout(800);

  const dump = async (tag) => {
    const d = await page.evaluate(() => {
      const f = document.querySelector('#field').getBoundingClientRect();
      const plots = [...document.querySelectorAll('#field .plot')].map(p => {
        const r = p.getBoundingClientRect();
        const fr = p.querySelector('.fruit');
        const st = p.querySelector('.stem');
        const frr = fr.getBoundingClientRect();
        const str = st.getBoundingClientRect();
        return {
          i: p.dataset.i,
          plot: [Math.round(r.top), Math.round(r.height)],
          stemH: st.style.height, stemRect: [Math.round(str.top), Math.round(str.height)],
          fruitCls: fr.className, fruitStyleBottom: fr.style.bottom,
          fruitRect: [Math.round(frr.top), Math.round(frr.height)],
          fruitBg: (fr.style.background || '').slice(0, 30),
        };
      });
      const b = document.querySelector('#beast').getBoundingClientRect();
      return { field: [Math.round(f.top), Math.round(f.height)], fieldScrollH: document.querySelector('#field').scrollHeight, plots, beast: [Math.round(b.top), Math.round(b.height), Math.round(b.left)] };
    });
    console.log('===', tag, JSON.stringify(d, null, 1));
  };

  await dump('S1 before decide');
  const acts = await page.$$('#actions .act');
  await acts[1].click();
  await page.waitForTimeout(3000);
  await dump('after S1 grow (S2 entered?)');
  await page.waitForTimeout(500);
  await dump('S2 idle');
  await browser.close();
})();
