const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8787/', { waitUntil: 'load' });
  await page.click('#startBtn');
  await page.waitForTimeout(500);
  const pickBox = await page.$eval('#pick', el => ({ h: el.clientHeight, sh: el.scrollHeight, oh: el.offsetHeight, mh: getComputedStyle(el).maxHeight }));
  await page.click('#beastPick .beastchip:nth-child(1)');
  await page.waitForTimeout(1200);
  const geo = await page.evaluate(() => {
    const wrap = document.querySelector('#chartWrap').getBoundingClientRect();
    const cv = document.querySelector('#chart');
    const field = document.querySelector('#field').getBoundingClientRect();
    return {
      wrap: [wrap.width, wrap.height], cvCss: [cv.clientWidth, cv.clientHeight],
      cvAttr: [cv.width, cv.height], field: [field.width, field.height],
      dpr: window.devicePixelRatio, vh: window.innerHeight, dvh: 26 * window.innerHeight / 100
    };
  });
  const hud = await page.$eval('.hud', el => el.innerText.replace(/\n/g, ' | '));
  console.log(JSON.stringify({ pickBox, geo, hud }, null, 2));
  await browser.close();
})();
