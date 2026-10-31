const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'load' });
  await p.click('#startBtn');
  await p.waitForTimeout(500);
  await p.click('#beastPick .beastchip:nth-child(1)');
  await p.waitForTimeout(1000);

  for (let s = 0; s < 3; s++) {
    const acts = await p.$$('#actions .act');
    console.log('stage', s, 'acts', acts.length);
    if (!acts.length) break;
    await acts[1].click();
    await p.waitForTimeout(3600);
    const st = await p.evaluate(() => ({
      on: [...document.querySelectorAll('.screen')].filter(x => x.classList.contains('on')).map(x => x.id),
      stage: document.querySelector('#stageName').textContent,
      form: document.querySelector('#formName') ? document.querySelector('#formName').textContent : null
    }));
    console.log('  after', JSON.stringify(st));
  }
  await p.waitForTimeout(1500);
  const fin = await p.evaluate(() => ({ on: [...document.querySelectorAll('.screen')].filter(x => x.classList.contains('on')).map(x => x.id) }));
  console.log('final', JSON.stringify(fin), 'errs', JSON.stringify(errs));
  await b.close();
})();
