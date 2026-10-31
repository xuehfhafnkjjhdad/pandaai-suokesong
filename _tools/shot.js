const { chromium } = require('playwright-core');
const path = require('path');

const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8787/';
const OUT = path.join(__dirname, '..', 'shots');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01-intro.png') });

  await page.click('#startBtn');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, '02-look.png') });

  // 第一关：查 1 项，然后决策
  await page.click('#probes .probe:nth-child(1)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '03-probe.png') });

  const pickAction = async (idx) => {
    const acts = await page.$$('#actions .act');
    if (!acts.length) throw new Error('没有可点的决策按钮');
    await acts[Math.min(idx, acts.length - 1)].click();
  };

  // S1 决策 → 截生长中
  await pickAction(1);            // 重仓进场（80%）
  await page.waitForTimeout(950);
  await page.screenshot({ path: path.join(OUT, '04-grow-0_9s.png') });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '05-reveal-1_3s.png') });
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.join(OUT, '06-take-light-2_0s.png') });
  await page.waitForTimeout(1400);

  // S2
  await page.click('#probes .probe:nth-child(2)');
  await page.click('#probes .probe:nth-child(3)');
  await page.waitForTimeout(200);
  await pickAction(0);            // 加仓，全押
  await page.waitForTimeout(3100);

  // S3
  await page.click('#probes .probe:nth-child(1)');
  await page.click('#probes .probe:nth-child(2)');
  await page.click('#probes .probe:nth-child(3)');
  await page.waitForTimeout(8500);
  await page.screenshot({ path: path.join(OUT, '07-s3.png') });
  await pickAction(1);            // 不动，等反弹
  await page.waitForTimeout(3400);

  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '08-result-top.png') });
  await page.evaluate(() => { const r = document.querySelector('#result'); r.scrollTop = r.scrollHeight; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '09-result-bottom.png') });

  const summary = await page.evaluate(() => {
    const res = document.querySelector('#result');
    return {
      visible: res.classList.contains('on'),
      xian: document.querySelector('.xian b') ? document.querySelector('.xian b').textContent : null,
      kad: document.querySelector('.kadname') ? document.querySelector('.kadname').textContent : null,
      plots: document.querySelectorAll('#resultField .plot').length,
      fruits: document.querySelectorAll('#resultField .fruit').length
    };
  });

  console.log(JSON.stringify({ summary, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
