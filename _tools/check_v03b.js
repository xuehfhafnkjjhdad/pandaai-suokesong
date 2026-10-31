/* v0.3 回归：五处改动 + 轮次交替 + 帮助入口 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/zhangtianhua/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = 'E:/pandaAI/shots/v03/';

async function playRound(p, tag, care) {
  const log = [];
  for (let s = 0; s < 3; s++) {
    if (care) {
      await p.click('#probes .probe:nth-child(1)');
      await p.click('#probes .probe:nth-child(2)');
      await p.click('#careLoose');
      await p.click('#careHedge');
    }
    const acts = await p.$$('#actions .act');
    log.push(await p.evaluate(() => [...document.querySelectorAll('#actions .act')].map(x => x.textContent)));
    await acts[0].click();
    await p.waitForTimeout(s < 2 ? 3400 : 7200);
  }
  return log;
}

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
  await p.screenshot({ path: OUT + '01-pick.png' });

  await p.click('#beastPick .beastcard:nth-child(4)');  // 选狼，换一只验证
  await p.waitForTimeout(900);

  // 决策说明 "?" 是否可点
  await p.click('#askline .qbtn');
  await p.waitForTimeout(350);
  const helpActions = await p.evaluate(() => {
    const pop = document.querySelector('#helpPop');
    return { on: pop.classList.contains('on'), head: pop.querySelector('h4').textContent, len: pop.innerText.length };
  });
  await p.screenshot({ path: OUT + '02-help-actions.png' });
  await p.click('#helpClose');
  await p.waitForTimeout(250);

  const r1 = await playRound(p, 'r1', true);
  const res1 = await p.evaluate(() => ({
    evidence: [...document.querySelectorAll('#result .ev span')].map(x => x.textContent).filter(t => t.includes('关')),
    again: document.querySelector('#againBtn').textContent,
    beastImg: [...document.querySelectorAll('#result img')].filter(i => i.complete && i.naturalWidth > 0).length
  }));
  await p.screenshot({ path: OUT + '05-result-top.png' });
  await p.evaluate(() => document.querySelector('.evbox').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '06-result-evidence.png' });

  // 第 2 轮（另一套选项）
  await p.click('#againBtn');
  await p.waitForTimeout(900);
  const ask2 = await p.evaluate(() => document.querySelector('#askline').textContent.trim());
  const r2 = await playRound(p, 'r2', false);
  await p.waitForTimeout(600);

  // 第 3 轮（应换回第一套）
  await p.click('#againBtn');
  await p.waitForTimeout(900);
  const ask3 = await p.evaluate(() => document.querySelector('#askline').textContent.trim());
  await p.screenshot({ path: OUT + '09-round3.png' });
  const r3first = await p.evaluate(() => [...document.querySelectorAll('#actions .act')].map(x => x.textContent));

  console.log(JSON.stringify({ errs, helpActions, r1, res1, ask2, r2, ask3, r3first }, null, 1));
  await b.close();
})();
