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

  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });

  // 等到"下一关就绪"或"结果页出现"
  async function waitAdvance(fromStage) {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const s = await page.evaluate(() => ({
        result: document.querySelector('#result') && document.querySelector('#result').classList.contains('on'),
        stage: document.querySelector('#stageName').textContent,
        acts: document.querySelectorAll('#actions .act').length
      }));
      if (s.result) return 'result';
      if (s.stage !== fromStage && s.acts > 0) return s.stage;
      await page.waitForTimeout(200);
    }
    return 'timeout';
  }

  const stageName = () => page.evaluate(() => document.querySelector('#stageName').textContent);

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await shot('01-intro.png');

  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await shot('01b-pick.png');

  await page.click('#beastPick .beastchip:nth-child(1)');
  await page.waitForTimeout(1400);
  await shot('02-look.png');

  await page.click('#probes .probe:nth-child(1)');
  await page.waitForTimeout(300);
  await shot('03-probe.png');

  const pickAction = async (idx) => {
    const acts = await page.$$('#actions .act');
    if (!acts.length) throw new Error('没有可点的决策按钮');
    await acts[Math.min(idx, acts.length - 1)].click();
  };

  // S1
  let cur = await stageName();
  await pickAction(1);
  await page.waitForTimeout(900);
  await shot('04-grow-0_9s.png');
  await page.waitForTimeout(450);
  await shot('05-reveal-1_3s.png');
  await page.waitForTimeout(700);
  await shot('06-take-light-2_0s.png');
  console.log('S1 →', await waitAdvance(cur));

  // S2
  cur = await stageName();
  await page.click('#probes .probe:nth-child(2)');
  await page.click('#probes .probe:nth-child(3)');
  await page.waitForTimeout(200);
  await pickAction(0);
  console.log('S2 →', await waitAdvance(cur));

  // S3
  cur = await stageName();
  await page.click('#probes .probe:nth-child(1)');
  await page.click('#probes .probe:nth-child(2)');
  await page.click('#probes .probe:nth-child(3)');
  await page.waitForTimeout(8500);
  await shot('07-s3.png');
  await pickAction(1);
  console.log('S3 →', await waitAdvance(cur));
  await page.waitForTimeout(900);

  await shot('08-result-top.png');
  await page.evaluate(() => { const r = document.querySelector('#result'); r.scrollTop = r.scrollHeight; });
  await page.waitForTimeout(400);
  await shot('09-result-bottom.png');

  const summary = await page.evaluate(() => {
    const res = document.querySelector('#result');
    return {
      visible: res.classList.contains('on'),
      xian: document.querySelector('.xian b') ? document.querySelector('.xian b').textContent : null,
      kad: document.querySelector('.kadname') ? document.querySelector('.kadname').textContent : null,
      plots: document.querySelectorAll('#resultField .plot').length,
      fruits: document.querySelectorAll('#resultField .fruit.on').length
    };
  });

  console.log(JSON.stringify({ summary, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
