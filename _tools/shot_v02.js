const { chromium } = require('playwright-core');
const path = require('path');

const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:8787/';
const OUT = path.join(__dirname, '..', 'shots', 'v02');

(async () => {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await shot('01-intro');

  // 开始 → 自选幼兽
  await page.click('#startBtn');
  await page.waitForTimeout(700);
  await shot('02-pick');

  // 选"火·狼"（故意与行为可能不一致，验证自我判定对比）
  await page.click('#beastPick .beastchip:nth-child(4)');
  await page.waitForTimeout(900);
  await shot('03-stage1-spring');

  const fieldH1 = await page.$eval('#field', el => el.clientHeight);

  // 农事：浇水 3 次 + 松土 + 立篱笆
  await page.click('#probes .probe:nth-child(1)');
  await page.waitForTimeout(120);
  const t0 = Date.now();
  await shot('04-water1');
  await page.click('#probes .probe:nth-child(2)');
  await page.click('#probes .probe:nth-child(3)');
  await page.click('#careLoose');
  await page.click('#careHedge');
  await page.waitForTimeout(200);
  await shot('05-care-done');

  // 决策 → 五拍
  const acts = await page.$$('#actions .act');
  await acts[1].click();   // 重仓进场 80%
  await page.waitForTimeout(950);
  await shot('06-grow-0_9');
  await page.waitForTimeout(400);
  await shot('07-reveal-1_3');
  await page.waitForTimeout(700);
  await shot('08-light-2_0');
  await page.waitForTimeout(1100);

  // 第二关（夏）
  await shot('09-stage2-summer');
  await page.click('#probes .probe:nth-child(1)');
  const a2 = await page.$$('#actions .act');
  await a2[0].click();     // 加仓全押
  await page.waitForTimeout(3200);

  // 第三关（冬）
  await shot('10-stage3-winter');
  await page.click('#careHedge');   // 立篱笆
  const a3 = await page.$$('#actions .act');
  await a3[2].click();     // 加仓摊平
  await page.waitForTimeout(3200);

  // 关末连喂
  await shot('11-feed-start');
  await page.waitForTimeout(400);
  await shot('12-feed-mid');
  await page.waitForTimeout(700);
  await shot('13-feed-mid2');
  await page.waitForTimeout(1400);
  await shot('14-result');

  const fieldH2 = await page.evaluate(() => {
    const f = document.querySelector('#field');
    return f ? f.clientHeight : -1;
  });

  // 展开依据
  const det = await page.$('.evbox summary');
  if (det) { await det.click(); await page.waitForTimeout(250); await shot('15-evidence'); }

  const info = await page.evaluate(() => ({
    season: document.querySelector('#field')?.dataset.season,
    form: document.querySelector('#formName')?.textContent,
    resultText: (document.querySelector('#result')?.innerText || '').slice(0, 700)
  }));

  console.log(JSON.stringify({ errors, fieldH1, fieldH2, info, elapsed: Date.now() - t0 }, null, 2));
  await browser.close();
})();
