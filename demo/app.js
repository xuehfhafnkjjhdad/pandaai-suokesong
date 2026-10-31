/* 五行灵兽 · 决策即播种 demo v0.2
 * 基线：《开发基线 v1.0 · 第一版系统 + 秒级节奏》
 *   第一版要素全留：四季（一关一季）/ 农事动作(查数据·松土·篱笆) / 双属性果实 /
 *                  三阶成长 / 自选幼兽→行为发现 / 15 格矩阵 / 血脉变体留位
 *   唯一改动：生长与喂养压到秒级（每关 2.8s，关末连喂 2.8s）
 * 注意：本文件的五行/营养计算是【内联简化版】，只为 demo 自洽；
 *       正式版必须按《接口契约 v1.0》走 rules.json + 独立算法模块，前端不许自算。
 */
(function () {
  'use strict';

  var PD = window.PD;
  var Journey = window.GardenJourney;
  var S = {
    i: 0, pos: 0, cash: 100000, entries: [],
    probes: [], locked: false, timers: [], chartToken: 0,
    stageStart: 0, self: null, fed: 0, rows: [], extra: null, pendingReveal: null,
    round: 0            // 第几轮。0 = 首轮；≥1 时换一套决策选项，避免重玩完全重复
  };

  var W = {
    A1: { 金: 4, 木: -1, 水: 1 }, A2: { 金: 2 }, A3: { 金: 2, 木: -1 },
    A4: { 土: 2, 木: 2, 金: -2 }, A4b: { 土: 3, 木: 2, 金: -2 },
    A5: { 火: 3, 土: -2, 金: -2 }, A6: { 水: 2, 火: 1, 金: 1 },
    A7: { 水: 1, 土: 1, 火: -1 }, A8: { 土: 1, 金: 1, 水: -1 },
    A9: { 火: 2, 水: -1 }, A10: { 金: 1, 土: 1, 火: -1 },
    A11: { 火: 2, 水: -1 }, D1: { 金: 2 }, D2: { 金: -1 }, D3: { 金: -1 },
    E1: { 土: 2, 金: 1 }, E2: { 火: 2, 土: -2 }, E3: { 火: 1 },
    F1: { 木: 2 }, F2: { 火: 1, 木: -1 }
  };
  var COLORS = {
    金: { name: '白金', hex: '#D9D2B8', ink: '#7A7358' },
    木: { name: '青碧', hex: '#4E9A6A', ink: '#2C5E40' },
    水: { name: '玄蓝', hex: '#2B4C7E', ink: '#1A3050' },
    火: { name: '赤红', hex: '#C0392B', ink: '#7A2018' },
    土: { name: '土黄', hex: '#B8860B', ink: '#6E5008' }
  };
  var ORDER = ['金', '木', '水', '火', '土'];

  // 五只灵兽。img 指向 assets/ 下的潜力态立绘，图未到位时自动降级成剪影。
  var BEASTS = [
    { k: '金', n: '猎豹', d: '盯信号，该砍就砍',
      img: 'assets/beast_cheetah_1.png', tag: '纪律型 · 时机派',
      long: '它有耐心，但只对"等信号"有耐心。位置盯住，条件不到就不动；到了就整只扑出去，走错了转身就走，不回头看。它最怕的不是亏，是明明看见机会却没上车——所以偶尔会自己造一个信号出来。' },
    { k: '木', n: '大象', d: '看得远，能等',
      img: 'assets/beast_elephant_1.png', tag: '长期型 · 复利派',
      long: '它按年算，不按天算。别人在争论今天涨跌，它在想三年后这头象能长多大。它吃得慢、走得慢，但每一步都算数。弱点是在需要快速掉头的时候，它转身要很久。' },
    { k: '水', n: '狐狸', d: '先验证，再动手',
      img: 'assets/beast_fox_1.png', tag: '研究型 · 验证派',
      long: '它不信任何人，包括自己。你给它一个结论，它先去翻原始数据；你给它一条规律，它先找反例。它很少被套，但也常常因为"还没验证完"，错过最快的那班车。' },
    { k: '火', n: '狼', d: '敢冲，怕错过',
      img: 'assets/beast_wolf_1.png', tag: '进攻型 · 动量派',
      long: '它是被"错过"驱动的，不是被"赚到"驱动的。群里都在涨的时候它坐不住，先冲进去再说。它的爆发力最强，回撤也最深——问题在于进场那一刻，它通常没看数据。' },
    { k: '土', n: '龟', d: '先保本，慢就是快',
      img: 'assets/beast_tortoise_1.png', tag: '防守型 · 保本派',
      long: '它先想的是"别亏完"，不是"能赚多少"。它慢、它躲、它宁可少赚。几乎不会死在一次暴跌里，但也容易在行情最好的时候待在岸上不下来。' }
  ];

  function beastOf(k) {
    for (var i = 0; i < BEASTS.length; i++) if (BEASTS[i].k === k) return BEASTS[i];
    return BEASTS[0];
  }
  function beastName(k) { return beastOf(k).n; }

  var FORMS = [
    { n: '潜力态 · 幼兽', s: '还没定形，可塑性最高' },
    { n: '成长期 · 壮兽', s: '开始有自己的方法了' },
    { n: '定形 · 定形兽', s: '形成了稳定的链路' }
  ];

  // 第一版第六节：五行 × 形态 = 15 格。形态决定"练多深"，五行决定"用什么题材"
  var MATRIX = {
    金: ['看一组带明确信号的行情，认识"信号"到底是什么',
      '用历史数据对比"止损 vs 扛住"，回撤差多少',
      '构建并回测一套信号触发规则，把假信号的成本也算进去'],
    木: ['看 10 年指数长线，理解复利是怎么长出来的',
      '对比"长期持有 vs 频繁交易"的历史结果',
      '构建定投 / 再平衡研究任务，叠加估值分位'],
    水: ['"提出假设 → 看数据 → 验证"的入门任务',
      '证据核查练习：一个结论 vs 它的原始数据',
      '自定义研究模板 + 均值回归现象的数据探索'],
    火: ['认识动量效应：为什么追涨有时候是有效的',
      '24 小时冷静规则实验，并在动量回测里看见交易成本',
      '高频数据与滑点研究'],
    土: ['认识波动率：同一个资产的三种风险呈现',
      '低波动策略的历史表现对比',
      '防御型组合 + 风险平价 / 尾部风险研究']
  };

  var PROBES = [
    { k: 'rank5y', t: '5年分位', d: '查位置：当前点位在近五年处于什么水平', f: function (m) { return m.pct_rank_5y + '%' } },
    { k: 'drawdown', t: '3年回撤', d: '查跌幅：距离近三年最高点跌了多少', f: function (m) { return m.drawdown_3y + '%' } },
    { k: 'vol_ratio', t: '量能倍数', d: '查热度：当日成交量是近20日均量的几倍', f: function (m) { return m.vol_ratio_20 + '倍' } },
    { k: 'amp_20', t: '20日振幅', d: '查波动：近20日最高价相对最低价的涨幅', f: function (m) { return m.amp_20 + '%' } }
  ];

  var SEASON = { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' };

  // 第二轮起换一套决策姿势：同样是这三关行情，但选项与仓位不同。
  // 用的行为码全部在规则表内（A3/A4/A5/A6/A7/A8/A10/A11/D1/E2），不需要改判分。
  var ALT_ACTIONS = {
    S1: [
      { id: 'S1_B_SL', label: '先设好止损，再进 40%', code: 'D1', positionPct: 40, stopLossSet: true },
      { id: 'S1_B_HALF', label: '半仓 50%，边走边看', code: 'A6', positionPct: 50 },
      { id: 'S1_B_WAIT', label: '这周不碰，先看着', code: 'A7', positionPct: 0 }
    ],
    S2: {
      holding: [
        { id: 'S2_B_TRIM', label: '减到三成，剩下的让它跑', code: 'A3', positionPct: 30 },
        { id: 'S2_B_ADD', label: '再加，涨势才刚开始', code: 'A5', positionPct: 100 },
        { id: 'S2_B_TRAIL', label: '上移止损，先把利润锁住', code: 'D1', positionPct: 'keep', stopLossSet: true }
      ],
      empty: [
        { id: 'S2_B_CHASE', label: '追进去（30%）', code: 'A5', positionPct: 30 },
        { id: 'S2_B_PASS', label: '涨成这样了，不追', code: 'A10', positionPct: 0 }
      ]
    },
    S3: {
      holding: [
        { id: 'S3_B_HALF', label: '先砍一半，留一半看', code: 'A8', positionPct: 50 },
        { id: 'S3_B_OFF', label: '关掉软件，不看了', code: 'A4', positionPct: 'keep' },
        { id: 'S3_B_ADD', label: '这是机会，加满', code: 'E2', positionPct: 100 }
      ],
      empty: [
        { id: 'S3_B_CATCH', label: '跌了 7%，接一点（20%）', code: 'A11', positionPct: 20 },
        { id: 'S3_B_WAIT', label: '还没跌完，继续等', code: 'A7', positionPct: 0 }
      ]
    }
  };

  // 农事与指标的说明文案（给不熟悉术语的人看）
  var HELP = {
    water: {
      t: '先看线索，再做决定',
      b: '每点一个指标，就等于"我去看了一眼数据"，土上会湿一分。<br><br>' +
        '这不是让你算，是看你会不会<b>先看再动</b>。一次不查就下单，和查了三项才下单，' +
        '在最后画像里是完全不同的两种人。查得多不代表更准，但<b>一次不看</b>一定更危险。<br><br>' +
        '<b>四个指标分别在说什么：</b><br>' +
        '· <b>5年分位</b>：现在的点位，在近五年里排第几。0% 就是五年最低。<br>' +
        '· <b>3年回撤</b>：从近三年最高点跌下来多少。<br>' +
        '· <b>量能倍数</b>：今天成交量是近 20 日平均成交量的几倍。大于 1 表示成交更活跃，不能单独判断涨跌。<br>' +
        '· <b>20日振幅</b>：近 20 日最高价相对最低价的涨幅，反映这段时间的波动范围。'
    },
    actions: {
      t: '这三个按钮是什么',
      b: '每个按钮就是一次真实的决定：<b>拿多少钱进场</b>。25% 就是拿四分之一的本金去买，空仓就是这次不买。<br><br>' +
        '这里的行情是 2024 年真实走过的。你这一关买多少，会直接决定<b>下一关你手里有多少仓位、扛多大的浮亏</b>——' +
        '第二关涨了你赚得多的同时，第三关跌下来你亏得也多。<br><br>' +
        '<b>选完不能改。</b>想清楚再点，这也是被记录的一部分。'
    }
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function at(ms, fn) { var t = setTimeout(fn, ms); S.timers.push(t); return t; }
  function clearTimers() { S.timers.forEach(clearTimeout); S.timers = []; }
  function fmtDate(d) { return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8); }
  function money(n) {
    var s = Math.abs(Math.round(n)).toLocaleString('zh-CN');
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
  }

  /* ─────────── 绘格 ─────────── */
  function buildPlot(host, idx) {
    var p = document.createElement('div');
    p.className = 'plot';
    p.dataset.i = idx;
    p.style.left = (idx * 33.333) + '%';
    p.innerHTML =
      '<div class="hole"></div>' +
      '<div class="wet"></div>' +
      '<div class="loose"><i></i><i></i><i></i></div>' +
      '<div class="hedge"><span></span><span></span></div>' +
      '<div class="plant-shadow"></div>' +
      '<div class="stem"><svg viewBox="0 0 84 140" preserveAspectRatio="none" aria-hidden="true"><path class="vine-edge" d="M42 140 C29 113 54 92 43 68 C35 49 47 25 42 6"/><path class="vine-light" d="M41 139 C28 113 53 92 42 68 C34 49 46 25 41 6"/><path class="twig" d="M42 98 Q24 94 15 77 M43 65 Q61 61 69 43"/><path class="blade lower" d="M35 102 Q5 104 8 77 Q33 75 35 102Z"/><path class="blade upper" d="M46 68 Q49 38 75 40 Q76 65 46 68Z"/><path class="vein" d="M13 83 L32 98 M50 63 L69 45"/></svg></div>' +
      '<div class="leaf"></div>' +
      '<div class="fruit"></div>' +
      '<div class="seed"></div>' +
      '<div class="dust"></div>';
    host.appendChild(p);
    p.tabIndex = 0;
    p.setAttribute('role', 'button');
    p.setAttribute('aria-label', '查看第' + (idx + 1) + '关的行为记录');
    function inspectPlot() {
      var e = S.entries[idx];
      if (!e) { sceneFeedback('这里留给你的下一次决定'); return; }
      var text = '第' + (idx + 1) + '关 · 仓位 ' + e.pos + '% · 查了 ' + e.probes.length + ' 项数据' + (e.stopLoss ? ' · 考虑了止损' : '');
      if (host.id === 'field') sceneFeedback(text);
      else { $('#helpPop').innerHTML = '<h4>这株植物的来历</h4><div class="hb">' + text + '</div><button class="btn" id="helpClose">知道了</button>'; $('#helpMask').classList.add('on'); $('#helpPop').classList.add('on'); $('#helpClose').onclick = function () { $('#helpMask').classList.remove('on'); $('#helpPop').classList.remove('on'); }; }
    }
    p.onclick = inspectPlot;
    p.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspectPlot(); } };
    return p;
  }

  function plotOf(host, idx) { return host.querySelector('.plot[data-i="' + idx + '"]'); }

  // 株高连续跟随仓位：80% 和 100% 必须看得出差异，不许分档
  function heightRatio(pos) {
    if (!pos || pos <= 0) return 0;
    var p = Math.min(100, pos);
    return 0.12 + 0.40 * p / 100;
  }
  var SIZE = [0, 18, 25, 34];
  var GROUND = 26;

  function paint(plot, f, animate, fh) {
    var stem = $('.stem', plot), fruit = $('.fruit', plot), leaf = $('.leaf', plot);
    var hole = $('.hole', plot), hedge = $('.hedge', plot), wet = $('.wet', plot), loose = $('.loose', plot);
    var base = GROUND;

    if (f.hole) {
      hole.classList.add('on');
      if (f.hedge) hedge.classList.add('on');
      return;
    }
    var h = fh * heightRatio(f.pos != null ? f.pos : 0);
    var size = SIZE[f.size] || 22;
    var c = COLORS[f.color];
    plot.classList.toggle('dry-plant', f.leaf === 'dry');
    plot.style.setProperty('--plant-tilt', ((Number(plot.dataset.i) % 3 - 1) * 4) + 'deg');
    var fruitAt = function () {
      stem.style.height = h + 'px';
      leaf.style.bottom = (base + h * 0.52) + 'px';
      fruit.style.bottom = (base + h - size / 2 - 2) + 'px';
      leaf.classList.add('ok');
      if (f.leaf === 'dry') leaf.classList.add('dry');
    };
    if (!animate) fruitAt();

    fruit.style.width = size + 'px';
    fruit.style.height = size + 'px';
    fruit.style.marginLeft = (-size / 2) + 'px';
    fruit.style.background = 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.55), ' + c.hex + ' 52%, ' + c.ink + ')';
    if (f.shine >= 3) fruit.style.boxShadow = '0 0 12px 4px ' + c.hex + '66';
    else if (f.shine === 2) fruit.style.boxShadow = '0 0 6px 1px ' + c.hex + '33';
    if (f.shine <= 1) fruit.classList.add('dim');
    if (f.hedge) hedge.classList.add('on');
    if (f.loose) loose.classList.add('on');
    if (f.wet >= 2) wet.classList.add('on');
    else if (f.wet === 1) { wet.style.opacity = .45; wet.classList.add('on'); }
    if (!animate) {
      fruitAt();
      fruit.classList.add('on');
    }
    return { stem: stem, fruit: fruit, leaf: leaf };
  }

  /* ─────────── K 线 ─────────── */
  var cv = $('#chart'), ctx = cv.getContext('2d'), CW = 0, CH = 0;

  function resizeCanvas() {
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    var dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CW = r.width; CH = r.height;
  }

  function viewRows() { return PD.stages[S.i].kline.slice(-44); }
  // 揭晓后的走势：append 到当前行情的右边，就是"K 线继续往后走"
  function rowsNow() { return S.rows.concat(S.extra || []); }

  function drawChart(n) {
    if (!CW) resizeCanvas();
    else {
      // 布局变化可能改变 canvas 的 CSS 尺寸而不触发 resize 事件，绘制前对一次尺寸
      var rr = cv.getBoundingClientRect();
      if (Math.round(rr.width) !== Math.round(CW) || Math.round(rr.height) !== Math.round(CH)) resizeCanvas();
    }
    ctx.clearRect(0, 0, CW, CH);
    var rows = rowsNow();
    var hi = -Infinity, lo = Infinity, k;
    for (k = 0; k < rows.length; k++) { hi = Math.max(hi, rows[k][2]); lo = Math.min(lo, rows[k][3]); }
    var padT = 12, padB = 20, span = hi - lo || 1;
    hi += span * .1; lo -= span * .1;
    var y = function (v) { return padT + (hi - v) / (hi - lo) * (CH - padT - padB); };
    var bw = CW / rows.length;
    var bodyW = Math.max(1.2, bw * .62);
    var cut = S.rows.length;   // 决策点

    ctx.strokeStyle = 'rgba(35,32,28,.07)'; ctx.lineWidth = 1;
    for (k = 1; k <= 3; k++) {
      var gy = padT + (CH - padT - padB) * k / 4;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(CW, gy); ctx.stroke();
    }

    var pts = [];
    for (k = 0; k < Math.min(n, rows.length); k++) {
      var r = rows[k], x = k * bw + bw / 2;
      var up = r[4] >= r[1];
      ctx.strokeStyle = up ? '#c0392b' : '#3f7d58';
      ctx.fillStyle = up ? '#c0392b' : '#3f7d58';
      if (k >= cut) ctx.globalAlpha = .85;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y(r[2])); ctx.lineTo(x, y(r[3])); ctx.stroke();
      var yo = y(r[1]), yc = y(r[4]);
      ctx.fillRect(x - bodyW / 2, Math.min(yo, yc), bodyW, Math.max(1.2, Math.abs(yc - yo)));
      pts.push([x, yc]);
      ctx.globalAlpha = 1;
    }
    if (pts.length > 1) {
      ctx.strokeStyle = 'rgba(35,32,28,.34)'; ctx.lineWidth = 1; ctx.beginPath();
      pts.forEach(function (p, idx) { idx ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.stroke();
    }
    // 决策点竖线：告诉用户"从这里开始是后来的事"
    if (S.extra && S.extra.length) {
      var cx = cut * bw;
      ctx.save();
      ctx.strokeStyle = 'rgba(35,32,28,.22)';
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, CH - padB); ctx.stroke();
      ctx.restore();
    }
    var last = rows[Math.min(n, rows.length) - 1];
    if (last) {
      ctx.fillStyle = '#23201c';
      ctx.font = '500 11px ui-monospace, monospace';
      ctx.fillText(last[4].toFixed(2), 4, 12);
      ctx.fillStyle = 'rgba(35,32,28,.45)';
      ctx.font = '11px -apple-system, system-ui, sans-serif';
      var mmdd = last[0].slice(0, 2) + '-' + last[0].slice(2, 4);
      ctx.fillText(mmdd, CW - 38, 12);
    }
  }

  function animateChart() {
    var token = ++S.chartToken;
    var total = S.rows.length, dur = 1600, t0 = performance.now();
    (function tick(now) {
      if (token !== S.chartToken) return;
      var p = Math.min(1, (now - t0) / dur);
      drawChart(Math.max(1, Math.round(p * total)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ─────────── 形态（对外只有名字，没有分数） ─────────── */
  function formOf(n) { return n <= 2 ? 0 : n <= 5 ? 1 : 2; }

  function setForm(n, flash) {
    var f = formOf(n);
    var el = $('#formName'), beast = $('#beast');
    var previous = beast.dataset.form;
    el.textContent = FORMS[f].n;
    beast.dataset.form = String(f);
    var journeyTitle = $('#journeyGoal');
    if (journeyTitle && journeyTitle.classList.contains('on')) journeyTitle.textContent = '成长形态 · ' + FORMS[f].n;
    // 有立绘时按阶换图：_1 潜力 / _2 成长 / _3 定形
    var art = $('#beastArt');
    if (art && BEAST_IMG_ON && S.self) {
      var src = beastOf(S.self).img.replace(/_1\.png$/, '_' + (f + 1) + '.png');
      if (art.getAttribute('src') !== src) art.setAttribute('src', src);
      art.alt = beastOf(S.self).n + ' · ' + FORMS[f].n;
    }
    if (flash && previous !== String(f)) {
      beast.classList.remove('evolving');
      void beast.offsetWidth;
      beast.classList.add('evolving');
      $('#feedTag').innerHTML = '<b>' + FORMS[f].n + '</b>吸收了你认真做决定的光';
      $('#feedTag').classList.add('on');
    }
    if (!flash) beast.classList.remove('evolving');
    if (flash) {
      el.parentNode.classList.remove('up');
      void el.parentNode.offsetWidth;
      el.parentNode.classList.add('up');
    }
  }

  /* ─────────── 关卡 ─────────── */
  // 只保留情境名，不再对外说"春 / 夏 / 冬"——季节只作为天光渲染，不作为概念出现
  function stageTitle(st) {
    var parts = String(st.name).split('·');
    return parts[1] || parts[0];
  }
  // S1/S2/S3 是内部编号，对外只说"第几关"
  function stageLabel(id) {
    var m = /S(\d)/.exec(String(id));
    return m ? '第' + m[1] + '关' : String(id);
  }

  function enterStage(idx) {
    S.i = idx; S.probes = []; S.locked = false; S.stageStart = performance.now();
    S.rows = viewRows(); S.extra = null;
    var st = PD.stages[idx];
    var field = $('#field');
    field.dataset.season = SEASON[st.name.charAt(0)] || 'spring';
    field.classList.remove('growing');
    $('#sceneGuide').innerHTML = '<span class="step on">观察</span><span class="sep">›</span><span class="step">决定</span><span class="sep">›</span><span class="step">生长</span>';
    $('#beast').style.left = '82%';

    $('#console').classList.remove('collapsed');
    // 决策按钮的说明入口：不做成新手引导页，点"?"才知道，不打断节奏
    // 显式构造可见快照，出题器无法接触后续行情。
    S.question = window.MarketQuestion.build({id:st.id, date:st.date, metrics:st.metrics, kline:st.kline}, S.pos, S.round);
    $('#askline').innerHTML = '<small class="market-source">PandaData · 沪深300 · ' + fmtDate(st.date) + ' 历史回放</small><p class="market-analysis">' + S.question.analysis + '</p><strong class="market-question">' + S.question.question + '</strong><i class="qbtn" data-help="actions">?</i>';
    $('#decisionReview').hidden = true;
    $('#stageName').textContent = stageTitle(st);
    $('#stageDate').textContent = fmtDate(st.date);
    var dots = document.querySelectorAll('.dots i');
    for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('on', d <= idx);

    setForm(S.fed, false);
    renderProbes(st);
    renderActions(st);
    startTimer();
    // 地里还一株都没有时，给一句话说清"做了决定就会长出来"
    var fh = $('#fieldHint');
    if (fh) fh.classList.toggle('on', S.entries.length === 0);
    requestAnimationFrame(function () { resizeCanvas(); animateChart(); repaintField(); });
  }

  // 已种下的植株按当前田地高度重画，避免布局变化后脱离地面
  function repaintField() {
    var field = $('#field');
    if (!field || !field.querySelector('.plot')) return;
    var fh = field.clientHeight;
    S.entries.forEach(function (e, idx) {
      var pl = plotOf(field, idx);
      if (pl) paint(pl, e.fruit, false, fh);
    });
  }

  function startTimer() {
    var f = $('#timerFill');
    f.style.transition = 'none'; f.style.transform = 'scaleX(1)';
    requestAnimationFrame(function () {
      f.style.transition = 'transform 10s linear';
      f.style.transform = 'scaleX(0)';
    });
  }

  function renderProbes(st) {
    var host = $('#probes'); host.innerHTML = '';
    $('#carehead').innerHTML = careHeadHtml(0);
    PROBES.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'probe';
      b.type = 'button';
      b.setAttribute('aria-describedby', 'probe-desc-' + p.k);
      b.innerHTML = '<span>' + p.t + '</span><small class="probe-value" aria-live="polite">点击查验</small>';
      b.onclick = function () {
        if (S.locked) return;
        if (S.probes.indexOf(p.k) < 0) S.probes.push(p.k);
        b.classList.add('used');
        $('.probe-value', b).textContent = p.f(st.metrics);
        waterFeedback();
        sceneFeedback(p.t + ' · ' + p.f(st.metrics));
      };
      var item = document.createElement('div');
      item.className = 'probe-item';
      var desc = document.createElement('p');
      desc.id = 'probe-desc-' + p.k;
      desc.className = 'probe-desc';
      desc.textContent = p.d;
      item.appendChild(b); item.appendChild(desc);
      host.appendChild(item);
    });
  }

  var toastTimer;
  function sceneFeedback(text) {
    var toast = $('#sceneToast');
    toast.textContent = text;
    toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('on'); }, 2200);
  }
  $('#petBtn').onclick = function () {
    if (S.locked) return;
    var beast = $('#beast');
    beast.classList.remove('nod');
    void beast.offsetWidth;
    beast.classList.add('nod');
    setTimeout(function () { beast.classList.remove('nod'); }, 550);
    sceneFeedback(['我陪你看清楚，再决定。', '这一次，你想验证什么？', '不着急，每种选择都会留下痕迹。'][Math.floor(Math.random() * 3)]);
  };

  function careHeadHtml(n) {
    return '<span class="ch-l"><b>查验行情</b><i class="qbtn" data-help="water">?</i></span>' +
      '<span class="ch-r">' + (n ? '已查 ' + n + ' / 4 项' : '点击指标，查看本轮数据') + '</span>';
  }

  // 查数据回执：≤0.15s，土立刻湿
  function waterFeedback() {
    var pl = plotOf($('#field'), S.i);
    var n = S.probes.length;
    if (pl) {
      var wet = $('.wet', pl);
      wet.classList.add('on');
      wet.style.opacity = n >= 2 ? 1 : .45;
    }
    $('#carehead').innerHTML = careHeadHtml(n);
  }

  function resolvePos(v, cur) {
    if (v === 'keep') return cur;
    if (v === 'half') return Math.round(cur / 2);
    return v;
  }

  function renderActions(st) {
    var host = $('#actions'); host.innerHTML = '';
    var group = S.question.options;
    group.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'act';
      b.textContent = a.label;
      b.onclick = function () { decide(st, a); };
      host.appendChild(b);
    });
  }

  function decide(st, a) {
    if (S.locked) return;
    S.locked = true;
    $('#field').classList.add('growing');
    $('#sceneGuide').innerHTML = '<span class="step">观察</span><span class="sep">›</span><span class="step on">决定已落地</span><span class="sep">›</span><span class="step on">生长中</span>';
    S.chartToken++;
    var prev = S.pos;
    S.pos = resolvePos(a.positionPct, S.pos);
    var btns = document.querySelectorAll('.act, .probe');
    for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    $('#timerFill').style.transition = 'none';
    var hedge = !!a.stopLossSet;
    var hint = $('#fieldHint'); if (hint) hint.classList.remove('on');
    // 收起后的那 2.8 秒，面板空出来一大块；用"播种→抽芽→结果→揭晓"四拍把它填成生长进度，
    // 而不是留一片白。空仓就写一行，不假装在长。
    var line = '你选了：' + a.label + (hedge ? '（篱笆立着，止损在）' : '');
    line += S.pos === 0
      ? '<div class="beats"><i class="on">这一关地空着，什么都不长</i></div>'
      : '<div class="beats"><i data-b="0">播种</i><i data-b="1">抽芽</i><i data-b="2">结果</i><i data-b="3">揭晓</i></div>' +
        '<div class="gline"><b id="glineFill"></b></div>';
    $('#askline').innerHTML = line;
    $('#console').classList.add('collapsed');
    if (S.pos > 0) {
      var gf = $('#glineFill');
      requestAnimationFrame(function () { gf.style.width = '100%'; });
    }

    var invest = S.cash * S.pos / 100;
    var pnl = invest * st.reveal.endPct / 100;

    var n = S.probes.length;
    var waterLv = n === 0 ? 0 : n <= 2 ? 1 : 2;
    var shine = Math.min(3, 1 + (waterLv >= 1 ? 1 : 0) + (hedge ? 1 : 0));
    var nutrition = Math.min(3, waterLv + (hedge ? 1 : 0));

    var entry = {
      stageId: st.id, actionId: a.id, code: a.code,
      question: S.question.question, marketAnalysis: S.question.analysis, actionLabel: a.label,
      pos: S.pos, prevPos: prev, probes: S.probes.slice(),
      stopLoss: hedge, loose: false,
      decisionMs: Math.round(performance.now() - S.stageStart),
      endPct: st.reveal.endPct, pnl: pnl,
      fruit: {
        color: colorOf(a.code, n, false),
        size: Math.abs(st.reveal.endPct) >= 5 ? 3 : Math.abs(st.reveal.endPct) >= 2 ? 2 : 1,
        shine: shine,
        pos: S.pos,
        leaf: (n === 0 && (a.code === 'A5' || a.code === 'A9' || a.code === 'E2')) ? 'dry' : 'ok',
        hedge: hedge,
        loose: false,
        wet: waterLv,
        hole: S.pos === 0
      },
      nutrition: nutrition
    };
    S.entries.push(entry);
    S.pendingReveal = st.reveal.kline || [];

    grow(entry, function () { showDecisionReview(st, entry); });
  }

  function showDecisionReview(st, entry) {
    var box = $('#decisionReview');
    var scores = calcWuxing([entry]).raw;
    var animal = beastOf(ORDER.slice().sort(function (a, b) { return scores[b] - scores[a]; })[0]);
    var explanations = {A1:'你选择执行退出条件，体现规则意识。', D1:'你在参与前安排退出条件，体现纪律意识。', A3:'你主动降低敞口，体现风险控制。', A4:'你愿意承受波动等待反弹；是否长期主义，还需要长期依据。', A5:'你在涨势加速时提高参与，体现进攻和动量偏好。', A9:'你在信号尚不明确时重仓，体现较强的冒险倾向。', A6:'你用较小仓位验证想法，体现试探和验证意识。', A7:'你选择等待更多证据，体现谨慎；多次观察才能区分研究与回避。', A10:'你在上涨时维持原仓位，体现克制。', A11:'你在急跌后尝试反弹，体现逆势冒险倾向。', E2:'你在下跌时增加敞口，体现较强的风险承担倾向。'};
    var outcome = entry.pos === 0 ? '空仓 · 本段收益 ¥0' : (entry.pnl >= 0 ? '本段赚 ' : '本段亏 ') + '¥' + Math.abs(Math.round(entry.pnl)).toLocaleString('zh-CN');
    box.innerHTML = '<small>选择后的真实行情 · ' + fmtDate(st.reveal.start) + ' — ' + fmtDate(st.reveal.end) + '</small><h3 class="' + (entry.pnl < 0 ? 'loss' : 'gain') + '">' + outcome + '</h3><p>指数从 ' + st.metrics.close.toFixed(2) + ' 到 ' + st.reveal.endClose.toFixed(2) + ' 点（' + (entry.endPct >= 0 ? '+' : '') + entry.endPct + '%）。按本关模拟资金 × ' + entry.pos + '% 仓位计算，不含费用。</p><p><b>这次行为更接近' + animal.n + ' · ' + animal.tag.split(' · ')[0] + '</b><br>' + (explanations[entry.code] || '这次选择已加入你的行为记录。') + ' 查了' + entry.probes.length + '项数据' + (entry.stopLoss ? '，有退出准备。' : '。') + '</p><small>这是本次行为线索，完整画像会累计多次选择；盈亏不参与性格评分。</small><button type="button" class="btn" id="reviewNext">' + (S.i < PD.stages.length - 1 ? '继续下一段行情' : '查看累计动物画像') + '</button>';
    box.hidden = false;
    var advanced = false;
    $('#reviewNext').onclick = function () {
      // 触屏连点、键盘重复激活只推进一次，防止跳关或重复喂养。
      if (advanced) return;
      advanced = true;
      this.disabled = true;
      box.hidden = true;
      if (S.i < PD.stages.length - 1) enterStage(S.i + 1);
      else feed(function () { showResult(); });
    };
  }

  function colorOf(code, probesN, loose) {
    var w = {}, k;
    var rules = W[code];
    if (rules) for (k in rules) w[k] = rules[k];
    if (probesN === 0) { w['水'] = (w['水'] || 0) - 1; w['火'] = (w['火'] || 0) + .5; }
    else w['水'] = (w['水'] || 0) + (probesN >= 3 ? 1 : .5);
    if (loose) w['水'] = (w['水'] || 0) + 1;
    var best = null, bv = -Infinity;
    ORDER.forEach(function (c) { if ((w[c] || 0) > bv) { bv = w[c] || 0; best = c; } });
    return bv > 0 ? best : '土';
  }

  /* ─────────── 2.8 秒五拍 ─────────── */
  // 揭晓：append 后几根真实行情，0.6 秒走完 —— "K 线继续往后走"
  function revealChart() {
    S.extra = (S.pendingReveal || []).slice();
    if (!S.extra.length) return;
    var base = S.rows.length, full = base + S.extra.length;
    var t0 = performance.now(), dur = 620;
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      drawChart(base + Math.round(p * (full - base)));
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function grow(entry, done) {
    var field = $('#field');
    var fh = field.clientHeight;
    var plot = plotOf(field, S.i);
    var seed = $('.seed', plot), dust = $('.dust', plot);
    var beast = $('#beast');
    beast.style.left = ((S.i * 33.333) + 16.666) + '%';
    var beat = function (n) {
      var b = document.querySelector('.beats i[data-b="' + n + '"]');
      if (b) b.classList.add('on');
    };

    if (entry.fruit.hole) {
      at(240, function () { $('.hole', plot).classList.add('on'); });
      at(900, function () { rollNumber(entry); revealChart(); });
      at(2000, function () { beast.classList.add('in', 'shake'); });
      at(2400, function () { beast.classList.remove('shake', 'in'); done(); });
      return;
    }

    paint(plot, entry.fruit, true, fh);
    // 0.2s 播种
    at(200, function () { seed.classList.add('drop'); dust.classList.add('puff'); beat(0); });
    // 0.5s 抽芽（株高由仓位决定）
    at(500, function () {
      beat(1);
      var s = $('.stem', plot), base = GROUND, h = fh * heightRatio(entry.pos);
      s.style.transition = 'height .42s cubic-bezier(.2,.8,.3,1)';
      s.style.height = h + 'px';
      var leaf = $('.leaf', plot);
      leaf.style.transition = 'bottom .42s ease, opacity .3s';
      leaf.style.bottom = (base + h * .52) + 'px';
      leaf.classList.add('ok');
      plot.classList.add('sprouting');
      if (entry.fruit.leaf === 'dry') plot.classList.add('dry-plant');
    });
    // 0.9s 结果
    at(900, function () {
      beat(2);
      var f = entry.fruit, fruit = $('.fruit', plot);
      var size = SIZE[f.size] || 22, c = COLORS[f.color];
      var base = GROUND, h = fh * heightRatio(entry.pos);
      fruit.style.width = size + 'px'; fruit.style.height = size + 'px';
      fruit.style.marginLeft = (-size / 2) + 'px';
      fruit.style.bottom = (base + h - size / 2 - 2) + 'px';
      fruit.style.background = 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.55), ' + c.hex + ' 52%, ' + c.ink + ')';
      if (f.shine >= 3) fruit.style.boxShadow = '0 0 12px 4px ' + c.hex + '66';
      else if (f.shine === 2) fruit.style.boxShadow = '0 0 6px 1px ' + c.hex + '33';
      fruit.classList.add('on');
      if (f.hedge) $('.hedge', plot).classList.add('on');
      if (f.loose) $('.loose', plot).classList.add('on');
    });
    // 1.3s 揭晓：数字滚动 + K 线继续往后走
    at(1300, function () { beat(3); rollNumber(entry); revealChart(); });
    // 2.0s 收割取光
    at(2000, function () {
      beast.classList.add('in');
      if (entry.fruit.shine <= 1) beast.classList.add('shake'); else beast.classList.add('nod');
      setTimeout(function () { beast.classList.remove('nod'); }, 520);
      if (entry.fruit.shine <= 1) {
        setTimeout(function () { $('.fruit', plot).classList.add('dim'); }, 180);
        setTimeout(function () { beast.classList.remove('shake'); }, 520);
      }
      sparks(plot, entry.fruit.color);
    });
    // 2.8s 留痕 → 下一关
    at(2900, function () { beast.classList.remove('in', 'nod', 'shake'); done(); });
  }

  function rollNumber(entry) {
    var box = $('#revealNum');
    var v = $('.v', box), kk = $('.k', box);
    v.textContent = '0';
    v.style.color = entry.endPct >= 0 ? '#c0392b' : '#3f7d58';
    kk.textContent = entry.pos === 0 ? '这一关你没有持仓' : '本段模拟收益 · 元';
    box.classList.add('show');
    var t0 = performance.now(), dur = 620;
    (function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      v.textContent = (entry.pnl >= 0 ? '+' : '−') + Math.abs(Math.round(entry.pnl * e)).toLocaleString('zh-CN');
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
    setTimeout(function () { box.classList.remove('show'); }, 1500);
  }

  function sparks(plot, color, x, y) {
    var box = $('.fruit', plot);
    var r = box.getBoundingClientRect(), f = $('#field').getBoundingClientRect();
    for (var i = 0; i < 4; i++) {
      (function (i) {
        var s = document.createElement('div');
        s.className = 'spark';
        s.style.left = (x != null ? x : (r.left - f.left + r.width / 2)) + 'px';
        s.style.top = (y != null ? y : (r.top - f.top + r.height / 2)) + 'px';
        s.style.background = COLORS[color].hex;
        $('#field').appendChild(s);
        requestAnimationFrame(function () {
          s.style.transition = 'transform .5s ease-out, opacity .5s';
          s.style.transform = 'translate(' + (18 + i * 6) + 'px,' + (-10 - i * 4) + 'px)';
          s.style.opacity = '0';
        });
        setTimeout(function () { s.remove(); }, 600);
      })(i);
    }
  }

  /* ─────────── 关末连喂：2.8 秒（第一版 30 秒喂养的秒级化） ─────────── */
  function silk(plot, beast) {
    var field = $('#field');
    var r = $('.fruit', plot).getBoundingClientRect();
    var b = beast.getBoundingClientRect(), fr = field.getBoundingClientRect();
    var x1 = r.left - fr.left + r.width / 2, y1 = r.top - fr.top + r.height / 2;
    var x2 = b.left - fr.left + b.width / 2, y2 = b.top - fr.top + b.height * .34;
    var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
    var s = document.createElement('div');
    s.className = 'silk';
    s.style.left = x1 + 'px';
    s.style.top = y1 + 'px';
    s.style.width = len + 'px';
    s.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
    field.appendChild(s);
    requestAnimationFrame(function () { s.classList.add('go'); });
    setTimeout(function () { s.remove(); }, 720);
  }

  function feed(done) {
    var field = $('#field'), beast = $('#beast'), tag = $('#feedTag');
    var items = S.entries.slice();
    tag.innerHTML = '<b>三株收成</b>一颗一颗喂给它';
    tag.classList.add('on');
    field.dataset.season = field.dataset.season || 'winter';
    beast.classList.add('in');

    var i = 0;
    function next() {
      if (i >= items.length) {
        tag.classList.remove('on');
        setTimeout(function () { beast.classList.remove('in'); done(); }, 260);
        return;
      }
      var e = items[i], pl = plotOf(field, i);
      beast.style.left = ((i * 33.333) + 16.666) + '%';
      at(240, function () {
        var f = $('.fruit', pl);
        if (e.fruit.hole || e.fruit.shine <= 1) {
          // 空坑 / 大而暗：灵兽吸一口就偏头，果实本体留在株上
          beast.classList.add('shake');
          if (!e.fruit.hole) f.classList.add('dim');
          setTimeout(function () { beast.classList.remove('shake'); }, 500);
        } else {
          silk(pl, beast);
          f.classList.add('dim');
          var r = f.getBoundingClientRect(), fr = field.getBoundingClientRect();
          sparks(pl, e.fruit.color, r.left - fr.left + r.width / 2, r.top - fr.top);
        }
        // 成长只取过程营养；空仓也可能有充分查验，不能被果实外观截断。
        S.fed += e.nutrition;
        setForm(S.fed, true);
      });
      at(800, function () { i++; next(); });
    }
    next();
  }

  /* ─────────── 结算 ─────────── */
  function calcWuxing(entries) {
    entries = entries || S.entries;
    var w = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
    entries.forEach(function (e) {
      var r = W[e.code];
      if (r) for (var k in r) w[k] += r[k];
      var n = e.probes.length;
      if (n >= 1) w['水'] += .5;
      if (n >= 3) w['水'] += .5;
      if (n === 0) { w['水'] -= 1; w['火'] += .5; }
      if (e.loose) w['水'] += .5;
      if (e.stopLoss) w['金'] += 2;
    });
    ORDER.forEach(function (c) { if (w[c] < 0) w[c] = 0; });
    var sum = ORDER.reduce(function (a, c) { return a + w[c]; }, 0);
    var pct = {};
    ORDER.forEach(function (c) { pct[c] = sum > 0 ? Math.round(w[c] / sum * 1000) / 10 : 20; });
    return { raw: w, pct: pct };
  }

  function diagnose() {
    var wx = calcWuxing();
    var top = ORDER.slice().sort(function (a, b) { return wx.pct[b] - wx.pct[a]; });
    var dPct = wx.pct[top[0]];
    var waterPct = wx.pct['水'], firePct = wx.pct['火'];
    var totalProbes = S.entries.reduce(function (a, e) { return a + e.probes.length; }, 0);
    var maxProbe = S.entries.reduce(function (a, e) { return Math.max(a, e.probes.length); }, 0);
    var slN = S.entries.filter(function (e) { return e.stopLoss; }).length;
    // 止损平仓 ≠ 不敢下手：必须先看有没有篱笆
    var emptyNoSL = S.entries.filter(function (e) { return e.pos === 0 && !e.stopLoss; }).length;
    var sameAction = S.entries.every(function (e) { return e.actionId === S.entries[0].actionId; });
    var heavyN = S.entries.filter(function (e) { return e.pos >= 70; }).length;

    // 判定必须同时满足「权重形状」与「行为证据」，否则会出现"查了 6 项却说你不验证"
    if (emptyNoSL === S.entries.length)
      return ['一次都没下手', '三关全空仓，也没在任何一关立篱笆——地里只留了三个坑。这次不是"你不行"，是系统还没看清你。', top[0], dPct];
    if (slN >= 1 && emptyNoSL === 0 && maxProbe >= 2 && firePct < 35) {
      return ['这一局没抓到明显卡点', '先查后动、扎过篱笆、仓位也没失控。特征太干净，反而不好下判断——多玩几局再看。', top[0], dPct];
    }
    if (emptyNoSL >= 1 && totalProbes >= 3) return ['不敢下判断', '你查了 ' + totalProbes + ' 项数据，但有 ' + emptyNoSL + ' 关始终没有真的下手。', top[0], dPct];
    if (sameAction) return ['只做熟悉的', '三关用了同一个动作——你的动作高度重复。', top[0], dPct];
    if (firePct >= 40 && totalProbes <= 2) return ['不会验证', '你的收成偏赤红，但几乎没查过数据就动手了。', top[0], dPct];
    if (dPct < 35) return ['想法不收敛', '三株颜色都不一样——你没有主线，每次都在用不同的方式做决定。', top[0], dPct];
    if (waterPct >= 30 && maxProbe <= 1) return ['容易接受结论', '你查过数据，但每关只看了一项就下了结论。', top[0], dPct];
    if (heavyN >= 2) return ['习惯用重仓表态', '三关的仓位都压得很满——你用仓位表达判断，而不是用依据。', top[0], dPct];
    return ['证据还不够', '这一局的行为太杂，没有一个能站住的形状。保留判断，比硬贴一个标签更诚实。', top[0], dPct];
  }

  function showResult() {
    var evidence = Journey ? Journey.profileEvidence(S.entries) : { entries: S.entries, rounds: 1, firstRound: 1 };
    var wx = calcWuxing(evidence.entries);
    var dx = diagnose();
    var dominant = ORDER.slice().sort(function (a, b) { return wx.pct[b] - wx.pct[a]; })[0];
    var kad = [dx[0], dx[1]], dPct = wx.pct[dominant];
    var scope = '第 ' + evidence.firstRound + '–' + (S.round + 1) + ' 轮 · ' + evidence.rounds + ' 轮累计 · ' + evidence.entries.length + ' 次决定';
    var xian = S.entries.reduce(function (a, e) { return a + e.nutrition; }, 0);
    var form = formOf(xian);
    var task = MATRIX[dominant][form];
    if (Journey) Journey.commit(S.entries, dominant, FORMS[form].n);
    var totalProbes = S.entries.reduce(function (a, e) { return a + e.probes.length; }, 0);
    var heavyN = S.entries.filter(function (e) { return e.pos >= 70; }).length;

    // 自我判定 vs 行为显示 —— 对外只说动物，不出现五行
    var same = S.self && S.self === dominant;
    var real = beastOf(dominant);
    S.nextSelf = dominant;
    var portrait = real.img.replace(/_1\.png$/, '_' + (form + 1) + '.png');
    var selfLine = !S.self ? '' : (same
      ? '你选的是 <b>' + beastOf(S.self).n + '</b>，累计记录中，你的行为也确实是 <b>' + real.n + '</b> 这一类 —— 你挺了解自己。'
      : '你以为自己是 <b>' + beastOf(S.self).n + '</b>，但三关的行为更像 <b>' + real.n + '</b> —— 这是这次最大的发现。');

    var html = '';
    html += '<h2>这是你这三关的地</h2>';
    html += '<div class="sub">' + PD.meta.story + '｜同一块地，三株收成</div>';
    html += '<div id="resultField"></div>';
    html += '<div class="profile-scope" data-animal="' + dominant + '" data-form="' + form + '" data-rounds="' + evidence.rounds + '" data-decisions="' + evidence.entries.length + '"><img class="profile-portrait" src="' + portrait + '" alt="' + real.n + ' · ' + FORMS[form].n + '"><div class="profile-copy"><b>你的动物画像 · ' + real.n + '</b><span>' + FORMS[form].n + '</span><span>' + scope + '</span><small>画像随累计行为更新；下一轮由' + real.n + '陪你继续。本轮成长依据三个决定。</small></div></div>';

    // 果实讲解图：紧贴田地，说清颜色/大小/光泽各代表什么
    html += '<div class="fnote"><div class="fnh">这几颗果实怎么读</div>';
    html += '<div class="fnrow"><i>大小</i><span>这一把赚了还是亏了。只影响好不好看，<b>不进任何评分</b>。</span></div>';
    html += '<div class="fnrow"><i>光泽</i><span>动手之前你查没查数据。亮 = 有依据，暗 = 凭感觉。<b>灵兽只吃光。</b></span></div>';
    html += '<div class="fnrow"><i>颜色</i><span>这一次你的决定偏哪一类：</span></div>';
    html += '<div class="fncolors">' + ORDER.map(function (c) {
      return '<span class="fnc"><em style="background:' + COLORS[c].hex + '"></em>' + beastOf(c).n + ' <s>' + beastOf(c).d + '</s></span>';
    }).join('') + '</div></div>';

    html += '<div class="formline"><b>' + FORMS[form].n + '</b><span>' + FORMS[form].s + '</span></div>';

    if (selfLine) {
      var selfB = S.self ? beastOf(S.self) : null;
      html += '<div class="card vs" style="margin-top:12px"><h3>你以为 vs 实际</h3>';
      if (selfB) {
        html += '<div class="vsrow">' +
          '<span class="vscell"><span class="bth big" style="--bc:' + COLORS[selfB.k].hex + '"><img src="' + selfB.img + '" alt=""></span>' +
          '<b>' + selfB.n + '</b><i>你选的</i></span>' +
          '<span class="vsarrow">→</span>' +
          '<span class="vscell"><span class="bth big" style="--bc:' + COLORS[real.k].hex + '"><img src="' + real.img + '" alt=""></span>' +
          '<b>' + real.n + '</b><i>行为显示的</i></span>' +
          '</div>';
      }
      html += '<p>' + selfLine + '</p>' +
        '<p class="tiny" style="margin-top:6px">' + real.n + ' · ' + real.tag + '</p></div>';
    }

    var shown = ORDER.filter(function (c) { return wx.pct[c] > 0; })
      .sort(function (a, b) { return wx.pct[b] - wx.pct[a]; });
    if (!shown.length) shown = ['土'];
    var filledN = S.entries.filter(function (e) { return !e.fruit.hole; }).length;
    html += '<div class="wtitle">累计行为分布</div>';
    html += '<div class="wsub">' + scope + '；右侧株数只统计本轮收成。</div>';
    html += '<div class="wuxing">' + shown.map(function (c) {
      var n = S.entries.filter(function (e) { return !e.fruit.hole && e.fruit.color === c; }).length;
      return '<div class="wrow">' +
        '<span class="bth" style="--bc:' + COLORS[c].hex + '"><img src="' + beastOf(c).img + '" alt=""></span>' +
        '<span style="width:38px">' + beastOf(c).n + '</span>' +
        '<span class="bar"><i style="width:' + wx.pct[c] + '%;background:' + COLORS[c].hex + '"></i></span>' +
        '<span class="pct">' + wx.pct[c] + '%</span>' +
        '<span class="fnum">' + (n ? n + ' 株' : '—') + '</span></div>';
    }).join('') + '</div>';

    html += '<div class="card"><h3>卡点 · 该练哪一步</h3><div class="kadname">' + kad[0] + '</div><p>' + kad[1] + '</p>';
    html += '<div class="ev">' + S.entries.map(function (e) {
      return '<span>' + stageLabel(e.stageId) + '｜' + (e.pos === 0 ? '空仓' : e.pos + '%') +
        '｜查数据 ' + e.probes.length + ' 项' + (e.stopLoss ? '｜有止损安排' : '') + '</span>';
    }).join('') + '</div></div>';

    html += '<div class="card"><h3>给你练这一件 · ' + real.n + ' × ' + FORMS[form].n.split(' · ')[0] + '</h3>';
    html += '<div class="kadname">' + task + '</div>';
    var noKad = kad[0] === '这一局没抓到明显卡点';
    html += '<p>用你偏好的题材（<b>' + real.n + '</b>），' +
      (noKad ? '把已经做对的那一步做深' : '练你不擅长的那一步（<b>' + kad[0] + '</b>）') + '，' +
      (totalProbes === 0 ? '这三次你还没有查过数据。' : '这三次你一共查了 ' + totalProbes + ' 项数据。') + '</p>';
    html += '<div class="meta"><span>6 分钟</span><span>Panda Data 近 5 年日线</span><span>做完地里多一株</span></div>';
    html += '</div>';

    // 依据：分数只藏在这里，不摆到脸上
    html += '<details class="evbox"><summary>查看依据（偏好分布、营养、时间）</summary>';
    html += '<div class="xian"><b>' + xian + '</b><span>/ 9 本局营养 · ' + FORMS[form].n + '</span></div>';
    html += '<div class="xbar">' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (k) {
      return '<i class="' + (k < xian ? 'on' : '') + '"></i>';
    }).join('') + '</div>';
    html += '<div class="ev">' + ORDER.map(function (c) {
      return '<span>' + beastOf(c).n + ' ' + (wx.raw[c] || 0).toFixed(1) + '（' + wx.pct[c] + '%）</span>';
    }).join('') + '</div>';
    html += '<div class="ev" style="margin-top:8px">' + S.entries.map(function (e) {
      return '<span>' + stageLabel(e.stageId) + '｜' + Math.round(e.decisionMs / 1000) + 's｜营养 ' + e.nutrition + '/3</span>';
    }).join('') + '</div>';
    html += '<p class="tiny">累计画像依据（' + scope + '）：' + evidence.entries.reduce(function (a, e) { return a + e.probes.length; }, 0) +
      ' 次查验数据、' +
      evidence.entries.filter(function (e) { return e.stopLoss; }).length + ' 次设置止损。与命理无关。</p>';
    html += '</details>';

    if (Journey) html += Journey.renderResult();
    html += '<div class="againbar"><button class="btn" id="againBtn">带着新目标，再来一轮</button>' +
      '<p class="tiny" style="text-align:center;margin:8px 0 0">同样的三关行情，这次换成另一套选项</p></div>';

    var res = $('#result');
    res.innerHTML = html;
    $('#againBtn').onclick = function () { restartRound(); };

    var rf = $('#resultField');
    RF_SEASON(rf);
    S.entries.forEach(function (e, idx) { buildPlot(rf, idx); });
    switchScreen('result');
    requestAnimationFrame(function () {
      S.entries.forEach(function (e, idx) {
        var pl = plotOf(rf, idx);
        paint(pl, e.fruit, false, pl.clientHeight);
      });
    });
  }

  function RF_SEASON(rf) {
    var s = getComputedStyle($('#field')).getPropertyValue('--sky1') || '#efe7d6';
    var s2 = getComputedStyle($('#field')).getPropertyValue('--sky2') || '#e9e1d1';
    var soil = getComputedStyle($('#field')).getPropertyValue('--soil') || '#6b4f36';
    var soil2 = getComputedStyle($('#field')).getPropertyValue('--soil-dark') || '#543d29';
    rf.style.background = 'linear-gradient(' + s.trim() + ' 0%, ' + s2.trim() + ' 26%, ' + soil.trim() + ' 26%, ' + soil2.trim() + ' 100%)';
  }

  /* ─────────── 屏幕切换 ─────────── */
  function switchScreen(id) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.toggle('on', list[i].id === id);
    window.scrollTo(0, 0);
  }

  /* ─────────── 启动 ─────────── */
  // assets 中已接入五兽各三阶的透明立绘。
  var BEAST_IMG_ON = true;

  // 立绘未就位时的剪影占位：五只各不相同，免得看起来像同一只猫
  var SILS = {
    金: '<svg viewBox="0 0 44 40" width="46" height="42" fill="currentColor">' +
      '<ellipse cx="18" cy="30" rx="13" ry="5.4"/><circle cx="33" cy="21" r="5.8"/>' +
      '<path d="M29.5 16.5 L28.5 10.5 L33.5 15 Z"/>' +
      '<path d="M5 29 Q-1 22 4 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    木: '<svg viewBox="0 0 44 40" width="46" height="42" fill="currentColor">' +
      '<ellipse cx="18" cy="30" rx="13" ry="7"/><ellipse cx="28" cy="21" rx="5.4" ry="8"/>' +
      '<circle cx="34" cy="21" r="5"/><path d="M35 25 Q37.5 32 31.5 34.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
    水: '<svg viewBox="0 0 44 40" width="46" height="42" fill="currentColor">' +
      '<ellipse cx="18" cy="30" rx="11" ry="4.8"/><circle cx="31" cy="20" r="5.4"/>' +
      '<path d="M27 15.5 L25.5 9 L31 14 Z"/><path d="M33 15 L35.5 9 L36 15.5 Z"/>' +
      '<path d="M7 30 Q-1 24 5 16 Q9 24 10 28 Z"/></svg>',
    火: '<svg viewBox="0 0 44 40" width="46" height="42" fill="currentColor">' +
      '<ellipse cx="19" cy="29" rx="12.5" ry="5.8"/><circle cx="32" cy="19" r="5.6"/>' +
      '<path d="M28 14 L26.5 7 L32 12 Z"/><path d="M35 13.5 L37.5 7 L38.5 13 Z"/>' +
      '<path d="M7 28 Q3 34 9 35.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    土: '<svg viewBox="0 0 44 40" width="46" height="42" fill="currentColor">' +
      '<path d="M7 32 Q7 15 22 15 Q37 15 37 32 Z"/><circle cx="34" cy="27" r="4.4"/>' +
      '<rect x="9" y="31" width="5.5" height="4.4" rx="2.2"/><rect x="19" y="32" width="5.5" height="4.4" rx="2.2"/>' +
      '<rect x="29" y="31" width="5.5" height="4.4" rx="2.2"/></svg>'
  };
  function silOf(k) { return SILS[k] || SILS['金']; }

  function initPick() {
    if (Journey && Journey.roundIndex()) {
      var garden = document.createElement('details');
      garden.className = 'garden-home';
      garden.innerHTML = '<summary>打开我的花园 · 已完成 ' + Journey.roundIndex() + ' 轮</summary>' + Journey.renderHome();
      $('#intro').appendChild(garden);
      $('#startBtn').textContent = '继续养成 · 第 ' + (Journey.roundIndex() + 1) + ' 轮';
    }
    var host = $('#beastPick');
    BEASTS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'beastcard';
      btn.style.setProperty('--bc', COLORS[b.k].hex);
      btn.innerHTML =
        '<span class="bimg' + (BEAST_IMG_ON ? '' : ' noimg') + '">' +
        (BEAST_IMG_ON
          ? '<img src="' + b.img + '" alt="' + b.n + '" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">'
          : '') +
        '<span class="bsil" style="color:' + COLORS[b.k].ink + '">' + silOf(b.k) + '</span></span>' +
        '<span class="btxt">' +
        '<span class="brow"><b class="bn">' + b.n + '</b><i class="btag">' + b.tag + '</i></span>' +
        '<span class="blong">' + b.long + '</span>' +
        '</span>';
      btn.onclick = function () {
        S.self = b.k;
        startRun();
      };
      host.appendChild(btn);
    });
  }

  // 清空田地，重新铺三格（重开时必须先删旧的，否则会叠在上一轮上面）
  function clearField() {
    var f = $('#field');
    var olds = f.querySelectorAll('.plot');
    for (var k = 0; k < olds.length; k++) olds[k].parentNode.removeChild(olds[k]);
    buildPlot(f, 0); buildPlot(f, 1); buildPlot(f, 2);
  }

  function startRun() {
    S.round = Journey ? Journey.roundIndex() : 0;
    if (Journey) { Journey.begin(); $('#journeyGoal').textContent = Journey.renderStage(); }
    $('#pick').classList.remove('on');
    $('#intro').classList.remove('picking');
    switchScreen('stage');
    var field = $('#field');
    if (!field.querySelector('.plot')) { buildPlot(field, 0); buildPlot(field, 1); buildPlot(field, 2); }
    requestAnimationFrame(function () { resizeCanvas(); enterStage(0); });
  }

  // 继续玩：不清页面，只清这一局的痕迹，换一套选项重来
  function restartRound() {
    clearTimers();
    if (S.nextSelf) S.self = S.nextSelf;
    S.round = Journey ? Journey.roundIndex() : S.round + 1;
    if (Journey) { Journey.begin(); $('#journeyGoal').textContent = Journey.renderStage(); }
    S.i = 0; S.pos = 0; S.cash = 100000; S.entries = [];
    S.probes = []; S.locked = false; S.fed = 0; S.rows = []; S.extra = null; S.pendingReveal = null;
    S.chartToken++;
    var fn = $('#formName'); if (fn) fn.textContent = FORMS[0].n;
    clearField();
    switchScreen('stage');
    requestAnimationFrame(function () { resizeCanvas(); enterStage(0); });
  }

  /* ─────────── 说明气泡（查数据 / 松土到底在干嘛） ─────────── */
  function showHelp(key) {
    var h = HELP[key];
    var pop = $('#helpPop'), mask = $('#helpMask');
    if (!h || !pop) return;
    pop.innerHTML = '<h4>' + h.t + '</h4><div class="hb">' + h.b + '</div>' +
      '<button class="btn" id="helpClose" style="width:100%;margin-top:12px">知道了</button>';
    pop.classList.add('on'); mask.classList.add('on');
    $('#helpClose').onclick = hideHelp;
  }
  function hideHelp() {
    var pop = $('#helpPop'), mask = $('#helpMask');
    if (pop) pop.classList.remove('on');
    if (mask) mask.classList.remove('on');
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.classList && t.classList.contains('qbtn')) {
        e.preventDefault(); e.stopPropagation();
        showHelp(t.getAttribute('data-help'));
        return;
      }
      t = t.parentNode;
    }
    hideHelp();
  }, true);

  $('#startBtn').onclick = function () {
    if ($('#pick').classList.contains('on')) return;
    $('#pick').classList.add('on');
    $('#intro').classList.add('picking');
  };

  if (BEAST_IMG_ON) document.body.classList.add('img-on');
  initPick();
  window.addEventListener('resize', function () { resizeCanvas(); drawChart(rowsNow().length); repaintField(); });
})();
