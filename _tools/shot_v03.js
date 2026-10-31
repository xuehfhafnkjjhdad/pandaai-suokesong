// v0.3 回归：选兽卡片 / 说明气泡 / 果实图例 / 去五行 / 第二轮换选项
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = 'E:/pandaAI/shots/v03/';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'load' });
  await p.click('#startBtn');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '01-pick.png', fullPage: true });

  const pick = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.beastcard')];
    return {
      n: cards.length,
      firstLong: cards[0] ? cards[0].querySelector('.blong').textContent.length : 0,
      firstTag: cards[0] ? cards[0].querySelector('.btag').textContent : '',
      fallback: document.querySelectorAll('.bimg.noimg').length,
      names: cards.map((c) => c.querySelector('.bn').textContent),
      scrollable: (() => { const i = document.querySelector('#intro'); return i.scrollHeight > i.clientHeight; })()
    };
  });

  await p.click('#beastPick .beastcard:nth-child(1)');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '02-stage.png' });

  const round1 = await p.evaluate(() => ({
    stageName: document.querySelector('#stageName').textContent,
    acts: [...document.querySelectorAll('#actions .act')].map((e) => e.textContent),
    hasQBtns: document.querySelectorAll('.qbtn').length
  }));

  // 浇水说明
  await p.click('#carehead .qbtn');
  await p.waitForTimeout(450);
  await p.screenshot({ path: OUT + '03-help-water.png' });
  const helpWater = await p.evaluate(() => ({
    on: document.querySelector('#helpPop').classList.contains('on'),
    title: document.querySelector('#helpPop h4').textContent,
    len: document.querySelector('#helpPop .hb').textContent.length
  }));
  await p.click('#helpClose');
  await p.waitForTimeout(350);

  // 农事说明
  await p.click('#carehead .ch-r .qbtn');
  await p.waitForTimeout(450);
  await p.screenshot({ path: OUT + '04-help-care.png' });
  const helpCare = await p.evaluate(() => ({
    on: document.querySelector('#helpPop').classList.contains('on'),
    title: document.querySelector('#helpPop h4').textContent
  }));
  await p.click('#helpClose');
  await p.waitForTimeout(300);

  // 走完三关：每关都查 2 项 + 松土 + 篱笆，选第一个动作
  for (let i = 0; i < 3; i++) {
    const probes = await p.$$('#probes .probe');
    if (probes[0]) await probes[0].click();
    if (probes[1]) await probes[1].click();
    await p.click('#careLoose');
    await p.click('#careHedge');
    const acts = await p.$$('#actions .act');
    await acts[0].click();
    await p.waitForTimeout(i < 2 ? 3300 : 7200);
  }
  await p.waitForTimeout(600);

  const resultTop = await p.evaluate(() => ({
    h2: (document.querySelector('#result h2') || {}).textContent,
    hasFnote: !!document.querySelector('.fnote'),
    fnoteText: (document.querySelector('.fnote') || {}).innerText,
    selfCard: [...document.querySelectorAll('.card')].map((c) => c.innerText).find((t) => t.includes('你以为')) || '',
    wrows: [...document.querySelectorAll('.wrow')].map((r) => r.innerText.replace(/\n/g, '|')),
    full: document.querySelector('#result').innerText
  }));
  await p.screenshot({ path: OUT + '05-result-top.png' });

  // 滚到果实图例
  await p.evaluate(() => { const f = document.querySelector('.fnote'); if (f) f.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '06-result-fnote.png' });

  // 五行字样检查（排除"浇水"里的水）
  const wx = ['金', '木', '火', '土'];
  const hit = wx.filter((c) => resultTop.full.includes(c));
  const waterHits = (resultTop.full.match(/水/g) || []).length;

  // 再来一轮
  await p.evaluate(() => { document.querySelector('#againBtn').scrollIntoView({ block: 'center' }); });
  await p.click('#againBtn');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '07-round2.png' });

  const round2 = await p.evaluate(() => ({
    stageName: document.querySelector('#stageName').textContent,
    askline: document.querySelector('#askline').textContent,
    acts: [...document.querySelectorAll('#actions .act')].map((e) => e.textContent),
    plots: document.querySelectorAll('#field .plot').length
  }));

  console.log(JSON.stringify({
    errs,
    pick,
    round1,
    helpWater,
    helpCare,
    result: {
      h2: resultTop.h2,
      hasFnote: resultTop.hasFnote,
      fnote: resultTop.fnoteText,
      self: resultTop.selfCard.slice(0, 120),
      wrows: resultTop.wrows,
      wuxingHits: hit,
      waterCharCount: waterHits
    },
    round2,
    actsChanged: JSON.stringify(round1.acts) !== JSON.stringify(round2.acts)
  }, null, 1));

  await b.close();
})();
