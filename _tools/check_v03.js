/* v0.3 回归：五处改动逐项验证 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = 'E:/pandaAI/shots/v03/';

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE, headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });

  await p.goto('http://127.0.0.1:8787/', { waitUntil: 'load' });
  await p.click('#startBtn');
  await p.waitForTimeout(700);

  // 1. 选兽区：动物图是否加载 + 介绍长度
  const pick = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.beastcard')];
    return cards.map(c => {
      const img = c.querySelector('.bimg img');
      return {
        name: c.querySelector('.bn').textContent,
        tag: c.querySelector('.btag') ? c.querySelector('.btag').textContent : '',
        imgOK: !!img && img.complete && img.naturalWidth > 0,
        imgW: img ? img.naturalWidth : 0,
        longLen: c.querySelector('.blong').textContent.length,
        cardH: c.offsetHeight,
        wuxingShown: /金|木|水|火|土/.test(c.textContent)
      };
    });
  });
  await p.screenshot({ path: OUT + '01-pick.png', fullPage: false });

  // 2. 进关：关卡名不带春夏秋冬
  await p.click('#beastPick .beastcard:nth-child(1)');
  await p.waitForTimeout(900);
  const hud = await p.evaluate(() => ({
    name: document.querySelector('#stageName').textContent,
    date: document.querySelector('#stageDate').textContent,
    hasSeasonWord: /春|夏|秋|冬/.test(document.querySelector('#stageName').textContent),
    actions: [...document.querySelectorAll('#actions .act')].map(x => x.textContent)
  }));

  // 3. 帮助气泡：浇水 "?" 与 农事 "?"
  const qbtns = await p.evaluate(() => [...document.querySelectorAll('.qbtn')].map(q => q.dataset.help));
  await p.click('.qbtn[data-help="water"]', { force: true });
  await p.waitForTimeout(400);
  const helpWater = await p.evaluate(() => {
    const pop = document.querySelector('#helpPop');
    return { on: pop.classList.contains('on'), len: pop.innerText.length, head: pop.querySelector('h4') ? pop.querySelector('h4').textContent : '' };
  });
  await p.screenshot({ path: OUT + '02-help-water.png' });
  await p.click('#helpClose');
  await p.waitForTimeout(300);

  await p.click('.qbtn[data-help="care"]', { force: true });
  await p.waitForTimeout(400);
  const helpCare = await p.evaluate(() => {
    const pop = document.querySelector('#helpPop');
    return { on: pop.classList.contains('on'), len: pop.innerText.length };
  });
  await p.screenshot({ path: OUT + '03-help-care.png' });
  await p.click('#helpClose');
  await p.waitForTimeout(300);

  // 4. 打一轮：浇水两项 + 松土 + 立篱笆 + 第一个动作
  await p.click('#probes .probe:nth-child(1)');
  await p.click('#probes .probe:nth-child(2)');
  await p.click('#careLoose');
  await p.click('#careHedge');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '04-care.png' });
  let acts = await p.$$('#actions .act');
  await acts[0].click();
  await p.waitForTimeout(3400);

  // S2
  await p.click('#probes .probe:nth-child(3)');
  await p.click('#careHedge');
  acts = await p.$$('#actions .act');
  await acts[0].click();
  await p.waitForTimeout(3400);

  // S3
  acts = await p.$$('#actions .act');
  await acts[0].click();
  await p.waitForTimeout(7200);

  // 5. 结果页：果实讲解 + 无五行字样（动物名不算）
  const result = await p.evaluate(() => {
    const r = document.querySelector('#result');
    const t = r.innerText;
    const fn = r.querySelector('.fnote');
    return {
      hasFnote: !!fn,
      fnoteLen: fn ? fn.innerText.length : 0,
      beastImgs: [...r.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth > 0).length,
      againTxt: r.querySelector('#againBtn') ? r.querySelector('#againBtn').textContent : '',
      stageNames: t.match(/S[123]/g) || []
    };
  });
  await p.screenshot({ path: OUT + '05-result-top.png' });
  await p.evaluate(() => document.querySelector('.fnote').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '06-result-fnote.png' });

  // 6. 再来一轮：按钮文案必须换掉
  await p.click('#againBtn');
  await p.waitForTimeout(1000);
  const round2 = await p.evaluate(() => ({
    name: document.querySelector('#stageName').textContent,
    ask: document.querySelector('#askline').textContent,
    actions: [...document.querySelectorAll('#actions .act')].map(x => x.textContent),
    plots: document.querySelectorAll('#field .plot').length,
    formName: document.querySelector('#formName').textContent
  }));
  await p.screenshot({ path: OUT + '07-round2.png' });

  console.log(JSON.stringify({ errs, pick, hud, qbtns, helpWater, helpCare, result, round2 }, null, 1));
  await b.close();
})();
