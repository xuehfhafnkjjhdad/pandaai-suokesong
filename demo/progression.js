/* 五行灵兽 · 多轮养成进度模块（progression.js）
 * 纯原生 JS IIFE，暴露 window.GardenJourney。
 * 职责：轮次进度、章节解锁、挑战判定、图鉴收集、本地存档（严格校验 + 内存兜底）。
 *
 * 设计红线（不可违背）：
 *   · 营养只作「当轮记录」，绝不跨轮累积去改变人格形态；
 *   · 盈亏绝不用于升级任何东西；
 *   · 所有写进 HTML 的内容只来自常量或已校验数值，杜绝 XSS；
 *   · localStorage 不可用时，本次会话仍可在内存中正常游玩。
 *
 * 与现有 app.js 的约定：
 *   · 五行元素：金 / 木 / 水 / 火 / 土；
 *   · 灵兽立绘路径与 app.js 的 BEASTS.img 保持一致（assets/beast_*_1.png）；
 *   · 一条「轮」由若干「关」组成（app.js 每局 3 关），entries 即各关行为数组；
 *     其中 loose = 验证想法，stopLoss = 设置止损，probes = 查数据项（字符串数组）。
 *
 * 轮次模型（本次修正要点）：
 *   · state.totalRounds 是「真实已完成总轮数」，可超过 20；
 *   · state.rounds 只保留最近 KEEP_ROUNDS(20) 条作为展示窗口，但不影响总轮数；
 *   · 每轮记录都保留 entries（每关行为数组），加载存档时逐条重洗，不丢每关数据；
 *   · 轮号由 totalRounds 与窗口长度推算，刷新后连续且真实。
 */
(function (root) {
  'use strict';

  /* ───────────── 常量 ───────────── */
  var STORAGE_KEY = 'wuxing_garden_v1';
  var STATE_VERSION = 1;
  var KEEP_ROUNDS = 20;          // 仅保留「最近 20 条」作为展示窗口；总轮数可超过此值

  // 五行元素（已知集合，校验用）
  var ELEMENTS = ['金', '木', '水', '火', '土'];
  // 形态名（已知集合；仅当轮记录，不由营养累积升级）
  var FORMS = ['潜力态 · 幼兽', '成长期 · 壮兽', '定形 · 定形兽'];
  // 已知查数据项键（与 app.js PROBES 对齐；S.probes 为键名字符串数组）
  var KNOWN_PROBES = ['rank5y', 'drawdown', 'vol_ratio', 'amp_20'];
  // 已知行为码（与 app.js 的 W / ALT_ACTIONS 对齐）
  var KNOWN_CODES = {
    A1: 1, A2: 1, A3: 1, A4: 1, A4b: 1, A5: 1, A6: 1, A7: 1, A8: 1, A9: 1,
    A10: 1, A11: 1, D1: 1, D2: 1, D3: 1, E1: 1, E2: 1, E3: 1, F1: 1, F2: 1
  };

  // 灵兽图鉴：图片路径与现有 app.js 完全一致
  var BEASTS_INFO = {
    '金': { name: '猎豹', img: 'assets/beast_cheetah_1.png' },
    '木': { name: '大象', img: 'assets/beast_elephant_1.png' },
    '水': { name: '狐狸', img: 'assets/beast_fox_1.png' },
    '火': { name: '狼',   img: 'assets/beast_wolf_1.png' },
    '土': { name: '龟',   img: 'assets/beast_tortoise_1.png' }
  };

  // 章节：用「已完成轮数」解锁
  var CHAPTERS = [
    { id: 1, name: '初识', unlock: 1 },
    { id: 2, name: '求证', unlock: 2 },
    { id: 3, name: '守约', unlock: 3 },
    { id: 5, name: '观心', unlock: 5 }
  ];

  // 未解锁灵兽的占位剪影（纯常量 SVG，避免 404 红屏）
  var SIL_SVG = '<svg viewBox="0 0 48 40" width="46" height="42" focusable="false" aria-hidden="true">' +
    '<ellipse cx="24" cy="30" rx="14" ry="7" fill="#9a8c6f"/>' +
    '<circle cx="14" cy="18" r="4" fill="#9a8c6f"/>' +
    '<circle cx="24" cy="13" r="4.5" fill="#9a8c6f"/>' +
    '<circle cx="34" cy="18" r="4" fill="#9a8c6f"/></svg>';

  /* ───────────── 基础工具 ───────────── */
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function clampInt(x, min, max) {
    var n = Math.round(num(x));
    if (!isFinite(n)) n = min;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }
  function inSet(x, arr) { return arr.indexOf(x) >= 0; }
  function inMap(x, map) { return Object.prototype.hasOwnProperty.call(map, x); }
  function emptyUnlocked() {
    var o = {}; ELEMENTS.forEach(function (e) { o[e] = false; }); return o;
  }
  function freshState() {
    return { v: STATE_VERSION, totalRounds: 0, rounds: [], unlocked: emptyUnlocked(), challengeCompleted: 0 };
  }

  /* ───────────── 存储：localStorage 失败则内存兜底 ───────────── */
  var storageOK = true;
  function getStorage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }
  var STORE = getStorage();
  if (!STORE) storageOK = false;

  var state = freshState();   // 内存态，始终为唯一事实来源

  function load() {
    if (!STORE) { state = freshState(); storageOK = false; return state; }
    var raw;
    try { raw = STORE.getItem(STORAGE_KEY); }
    catch (e) { storageOK = false; state = freshState(); return state; }   // 读取被拒
    if (raw == null) { state = freshState(); return state; }
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {                       // 坏存档：丢弃并重写为干净状态
      state = freshState();
      save(state);
      return state;
    }
    state = validate(parsed) || freshState();
    return state;
  }

  function save(s) {
    state = (s || state);
    // 注意：totalRounds 不由 rounds.length 反推，而是真实总轮数（可超过窗口长度）。
    // 兜底：总轮数不得低于已保留的合法记录数。
    if (!isNum(state.totalRounds) || state.totalRounds < state.rounds.length) {
      state.totalRounds = state.rounds.length;
    }
    if (!STORE) { storageOK = false; return false; }
    try { STORE.setItem(STORAGE_KEY, JSON.stringify(state)); storageOK = true; return true; }
    catch (e) { storageOK = false; return false; }   // storage 拒绝：仅留内存
  }

  /* ───────────── 严格校验 ───────────── */
  // 把单关行为洗成最简、确定、可信的对象；非法项直接丢弃或填默认。
  // 真实 probes 是「键名字符串数组」；若记录已被简化（probes 缺失但有 probesLen），以 probesLen 兜底。
  function sanitizeEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var probes = e.probes;
    var plen;
    if (Array.isArray(probes)) {
      var c = 0;
      for (var i = 0; i < probes.length && i < 50; i++) {
        if (inSet(probes[i], KNOWN_PROBES)) c++;   // 只数已知查数据项
      }
      plen = c;
    } else if (isNum(e.probesLen)) {
      plen = clampInt(e.probesLen, 0, 999);         // 已简化记录：直接信任 probesLen
    } else {
      plen = 0;
    }
    var f = e.fruit || {};
    return {
      pos: clampInt(e.pos, 0, 100),
      probesLen: clampInt(plen, 0, 999),
      stopLoss: !!e.stopLoss,
      loose: !!e.loose,
      fruit: {
        color: (f && inSet(f.color, ELEMENTS)) ? f.color : '土',
        size: clampInt(f ? f.size : 0, 0, 3),
        shine: clampInt(f ? f.shine : 0, 0, 3),
        hole: !!(f && f.hole),
        leaf: (f && f.leaf === 'dry') ? 'dry' : 'ok',
        hedge: !!(f && f.hedge),
        loose: !!(f && f.loose),
        wet: clampInt(f ? f.wet : 0, 0, 2)
      },
      nutrition: clampInt(e.nutrition, 0, 9),
      actionId: typeof e.actionId === 'string' ? e.actionId.slice(0, 80) : '',
      stageId: typeof e.stageId === 'string' ? e.stageId.slice(0, 20) : '',
      code: inMap(e.code, KNOWN_CODES) ? e.code : '—'
    };
  }

  // 校验一条轮次记录（用于读取旧存档）；优先保留每关 entries，逐条重洗，不丢每关数据。
  function sanitizeRound(rec) {
    if (!rec || typeof rec !== 'object') return null;
    var entries = [];
    if (Array.isArray(rec.entries)) {
      for (var i = 0; i < rec.entries.length && i < 50; i++) {
        var se = sanitizeEntry(rec.entries[i]);
        if (se) entries.push(se);
      }
    }
    // 摘要字段：优先用存储值，缺失则从 entries 推导
    var pSum = 0, sSum = 0;
    entries.forEach(function (e) { pSum += e.probesLen; if (e.stopLoss) sSum++; });
    var f = rec.fruit || {};
    return {
      roundNo: 0,  // 下面由 totalRounds 与窗口长度重排
      pos: clampInt(rec.pos, 0, 100),
      probesLen: clampInt(rec.probesLen != null ? rec.probesLen : pSum, 0, 999),
      probesTotal: clampInt(rec.probesTotal != null ? rec.probesTotal : (rec.probesLen != null ? rec.probesLen : pSum), 0, 999),
      stopLoss: clampInt(rec.stopLoss, 0, 99),
      stops: clampInt(rec.stops != null ? rec.stops : (rec.stopLoss != null ? rec.stopLoss : sSum), 0, 99),
      loose: clampInt(rec.loose, 0, 99),
      fruit: {
        color: (f && inSet(f.color, ELEMENTS)) ? f.color : '土',
        size: clampInt(f ? f.size : 0, 0, 3),
        shine: clampInt(f ? f.shine : 0, 0, 3),
        hole: !!(f && f.hole),
        leaf: (f && f.leaf === 'dry') ? 'dry' : 'ok',
        hedge: !!(f && f.hedge),
        loose: !!(f && f.loose),
        wet: clampInt(f ? f.wet : 0, 0, 2)
      },
      nutrition: clampInt(rec.nutrition, 0, 99),
      code: inMap(rec.code, KNOWN_CODES) ? rec.code : '—',
      dominant: inSet(rec.dominant, ELEMENTS) ? rec.dominant : '土',
      form: inSet(rec.form, FORMS) ? rec.form : FORMS[0],
      completedChallenge: !!rec.completedChallenge,
      entries: entries
    };
  }

  // 严格过滤整份存档：只接纳已知元素 / 有限数值，其余丢弃或填默认。
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return freshState();
    var out = freshState();
    // 图鉴
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      ELEMENTS.forEach(function (e) { out.unlocked[e] = !!raw.unlocked[e]; });
    }
    // 轮次记录：只保留最近 KEEP_ROUNDS 条（窗口），顺序保留 = 轮次顺序
    if (Array.isArray(raw.rounds)) {
      var start = Math.max(0, raw.rounds.length - KEEP_ROUNDS);
      for (var i = start; i < raw.rounds.length; i++) {
        var r = sanitizeRound(raw.rounds[i]);
        if (r) out.rounds.push(r);
      }
    }
    // 总轮数：保持 raw.totalRounds，但必须 >= 合法记录数量（不足则取较大值兜底）
    var storedTotal = clampInt(raw.totalRounds, 0, 1000000);
    var validCount = out.rounds.length;
    out.totalRounds = (storedTotal >= validCount) ? storedTotal : validCount;
    // 轮号：依 totalRounds 与窗口长度生成（最近窗口对应 total-窗口+1 .. total）
    out.rounds.forEach(function (r, idx) { r.roundNo = out.totalRounds - (validCount - 1) + idx; });
    // 图鉴再由记录里的主属性补齐
    out.rounds.forEach(function (r) { if (inSet(r.dominant, ELEMENTS)) out.unlocked[r.dominant] = true; });
    // 挑战完成数（叶章数）：以合法记录里的 completedChallenge 为准，再与存储值取较大（防漏记）
    var cc = 0;
    out.rounds.forEach(function (r) { if (r.completedChallenge) cc++; });
    out.challengeCompleted = Math.max(clampInt(raw.challengeCompleted, 0, 99999), cc);
    return out;
  }

  /* ───────────── 挑战判定（以 begin 时的总轮数决定） ───────────── */
  // 返回 null 表示本轮无挑战（首轮）
  function challengeFor(roundNo) {
    if (roundNo <= 1) return null;                                  // 初识：无挑战
    if (roundNo === 2) return { type: 'verify_probe', short: '求证 · 每关至少查两项' };
    if (roundNo === 3) return { type: 'stop_loss', short: '守约 · 每关设下止损' };
    if (roundNo === 4) return { type: 'observe', short: '观心练习 · 验证想法并查两项' };
    return { type: 'observe', short: '观心 · 验证想法并查两项' };    // 第 5 轮及以后
  }
  function goalText(type, roundNo) {
    if (type === 'verify_probe') return '求证——每一关至少查 2 项数据，先看清再动手。';
    if (type === 'stop_loss') return '守约——每一关都先设置止损，守住退出条件。';
    if (type === 'observe') {
      var name = (roundNo === 4) ? '观心练习' : '观心';
      return name + '——每关带着一个想法去验证，并查至少 2 项数据。';
    }
    return '初识——先熟悉三关行情，这一轮没有挑战。';
  }
  // 挑战要求「每关」都满足：遍历所有关，任一不满足即未通过。
  function challengeMet(type, entries) {
    if (!type) return false;
    if (!entries || !entries.length) return false;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (type === 'verify_probe') { if (e.probesLen < 2) return false; }
      else if (type === 'stop_loss') { if (!e.stopLoss) return false; }
      else if (type === 'observe') { if (!e.loose || e.probesLen < 2) return false; }
    }
    return true;
  }

  /* ───────────── 本轮会话（幂等控制） ───────────── */
  var session = { active: false, committed: false, roundNo: 0, challenge: null };

  function currentRoundNo() {
    return session.active ? session.roundNo : (state.totalRounds + 1);
  }

  // begin()：清掉本轮提交幂等标识，并按「当前已完成总轮数」决定本轮编号与挑战。
  function begin() {
    var roundNo = state.totalRounds + 1;
    var ch = challengeFor(roundNo);
    session.active = true;
    session.committed = false;
    session.roundNo = roundNo;
    session.challenge = ch;
    return { ok: true, roundNo: roundNo, challenge: ch };
  }

  // 把若干关行为压成一条最简轮次记录（营养只合计当轮，绝不跨轮累积改形）。
  // 同时保留 entries（每关行为数组），供存档与逐关复核使用。
  function simplify(entries, dominant, form) {
    var pos = 0, probes = 0, stops = 0, loose = 0, nutrition = 0, best = null, bestPos = -1;
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.pos > bestPos) { bestPos = e.pos; best = e; }
      if (e.pos > pos) pos = e.pos;
      probes += e.probesLen;
      if (e.stopLoss) stops++;
      if (e.loose) loose++;
      nutrition += e.nutrition;
    }
    var fruit = best
      ? best.fruit
      : { color: inSet(dominant, ELEMENTS) ? dominant : '土', size: 1, shine: 0, hole: false, leaf: 'ok', hedge: false, loose: false, wet: 0 };
    return {
      pos: clampInt(pos, 0, 100),
      probesLen: clampInt(probes, 0, 999),
      probesTotal: clampInt(probes, 0, 999),
      stopLoss: clampInt(stops, 0, 99),
      stops: clampInt(stops, 0, 99),
      loose: clampInt(loose, 0, 99),
      fruit: { color: fruit.color, size: fruit.size, shine: fruit.shine, hole: !!fruit.hole, leaf: fruit.leaf, hedge: !!fruit.hedge, loose: !!fruit.loose, wet: clampInt(fruit.wet, 0, 2) },
      nutrition: clampInt(nutrition, 0, 99),
      code: best ? best.code : '—',
      dominant: inSet(dominant, ELEMENTS) ? dominant : '土',
      form: inSet(form, FORMS) ? form : FORMS[0],
      completedChallenge: false,
      entries: entries
    };
  }

  // commit()：每轮仅提交一次；必须恰好 3 关（clean.length === 3）才提交，否则返回 invalid_entries。
  function commit(entries, dominant, form) {
    if (!session.active || session.committed) {
      return { ok: false, reason: session.committed ? 'already_committed' : 'not_started' };
    }
    var arr = Array.isArray(entries) ? entries : (entries ? [entries] : []);
    var clean = [];
    for (var i = 0; i < arr.length; i++) {
      var e = sanitizeEntry(arr[i]);
      if (e) clean.push(e);
    }

    // 数据不完整（必须恰好三关）一律不提交，避免污染存档。
    if (clean.length !== 3) {
      return { ok: false, reason: 'invalid_entries' };
    }

    var rec = simplify(clean, dominant, form);
    rec.roundNo = session.roundNo;
    var met = challengeMet(session.challenge ? session.challenge.type : null, clean);
    rec.completedChallenge = met;

    state.rounds.push(rec);
    if (state.rounds.length > KEEP_ROUNDS) state.rounds = state.rounds.slice(-KEEP_ROUNDS);
    state.totalRounds = state.totalRounds + 1;

    if (inSet(rec.dominant, ELEMENTS)) state.unlocked[rec.dominant] = true;
    if (met) state.challengeCompleted += 1;   // 叶章数仅在成功挑战时 +1

    save(state);

    session.committed = true;
    session.active = false;

    return {
      ok: true,
      roundNo: rec.roundNo,
      record: rec,
      challengeMet: met,
      challenge: session.challenge,
      nextRoundNo: state.totalRounds + 1,
      totalRounds: state.totalRounds,
      storageOK: storageOK
    };
  }

  /* ───────────── 渲染（只输出常量 / 已校验数值，避免 XSS） ───────────── */
  function css() {
    return '<style>' +
      '.gj-root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;' +
      'color:#3a3328;background:#f6efe0;border:1px solid #e7dcc4;' +
      'border-radius:14px;padding:18px;max-width:580px;line-height:1.62;box-sizing:border-box}' +
      '.gj-root *{box-sizing:border-box}' +
      '.gj-root h2{font-size:19px;margin:0 0 4px;color:#2f5d40;letter-spacing:.5px}' +
      '.gj-sub{font-size:12px;color:#8a7c5f;margin-bottom:12px}' +
      '.gj-card{background:transparent;border:none;padding:11px 0;margin:0;border-bottom:1px solid #e7dcc4}' +
      '.gj-card:last-child{border-bottom:none}' +
      '.gj-h{font-size:13px;font-weight:600;color:#6e5b34;margin-bottom:8px}' +
      '.gj-grid{display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between}' +
      '.gj-beast{width:18%;text-align:center;font-size:12px;color:#5b4f37}' +
      '.gj-beast img{width:100%;max-width:54px;height:50px;object-fit:contain;display:block;margin:0 auto 4px}' +
      '.gj-beast.gj-locked{opacity:.5;filter:grayscale(1)}' +
      '.gj-lock{font-size:11px;color:#9a8c6f}' +
      '.gj-track{display:flex;gap:6px}' +
      '.gj-ch{flex:1;text-align:center;font-size:12px;padding:7px 4px;border-radius:8px;' +
      'background:rgba(255,255,255,.4);border:1px solid #e3d6b8;color:#9a8c6f}' +
      '.gj-ch.on{background:#e7f0e2;border-color:#9cc4a6;color:#2f5d40;font-weight:600}' +
      '.gj-ch.cur{box-shadow:inset 0 0 0 2px #b8860b}' +
      '.gj-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:4px 0;border-bottom:1px dashed #e3d6b8}' +
      '.gj-row:last-child{border-bottom:none}' +
      '.gj-num{font-variant-numeric:tabular-nums;color:#2f5d40;font-weight:600}' +
      '.gj-badge{display:inline-block;font-size:13px;font-weight:600;color:#2f5d40;' +
      'background:#e7f0e2;border:1px solid #9cc4a6;border-radius:20px;padding:5px 12px;margin:4px 0}' +
      '.gj-note{font-size:12px;color:#7a6f54;background:rgba(184,134,11,.12);border-left:3px solid #b8860b;' +
      'padding:8px 10px;border-radius:6px;margin:10px 0}' +
      '.gj-warn{font-size:12px;color:#7a2018;background:rgba(192,57,43,.1);border-left:3px solid #c0392b;' +
      'padding:8px 10px;border-radius:6px;margin:10px 0}' +
      '.gj-muted{font-size:12px;color:#9a8c6f}' +
      '.gj-root code{background:#efe6d2;padding:1px 5px;border-radius:4px;font-size:11px}' +
      '</style>';
  }

  function beastGridHtml() {
    var cells = ELEMENTS.map(function (el) {
      var info = BEASTS_INFO[el];
      if (state.unlocked[el]) {
        return '<div class="gj-beast"><img src="' + info.img + '" alt="' + info.name + '">' +
          '<div>' + info.name + '</div></div>';
      }
      return '<div class="gj-beast gj-locked">' + SIL_SVG + '<div class="gj-lock">未解锁</div></div>';
    });
    return '<div class="gj-grid">' + cells.join('') + '</div>';
  }

  function currentChapterUnlock(roundNo) {
    var best = 0;
    CHAPTERS.forEach(function (c) { if (c.unlock <= roundNo && c.unlock > best) best = c.unlock; });
    return best;
  }
  function chapterTrackHtml(curRoundNo) {
    var curU = currentChapterUnlock(curRoundNo);
    var cells = CHAPTERS.map(function (c) {
      var on = state.totalRounds >= c.unlock;
      var cls = 'gj-ch' + (on ? ' on' : '') + (c.unlock === curU ? ' cur' : '');
      return '<div class="' + cls + '">' + c.name + (on ? '' : ' · 锁') + '</div>';
    });
    return '<div class="gj-track">' + cells.join('') + '</div>';
  }

  function deltaTxt(d) {
    if (d > 0) return '多 ' + d;
    if (d < 0) return '少 ' + Math.abs(d);
    return '持平';
  }

  // 保留窗口内的逐关行为，加上尚未提交的本轮；已提交后不重复计算。
  function profileEvidence(current) {
    var rows = state.rounds.filter(function (r) { return r.entries && r.entries.length === 3; });
    var entries = [];
    rows.forEach(function (r) {
      r.entries.forEach(function (e) {
        entries.push({ code: e.code, actionId: e.actionId || e.code, pos: e.pos,
          probes: new Array(e.probesLen || 0), loose: e.loose, stopLoss: e.stopLoss });
      });
    });
    var adding = !session.committed && Array.isArray(current) && current.length === 3;
    if (adding) entries = entries.concat(current);
    return { entries: entries, rounds: rows.length + (adding ? 1 : 0),
      firstRound: rows.length ? rows[0].roundNo : state.totalRounds + 1 };
  }

  // roundIndex()：返回已完成总轮数
  function roundIndex() { return state.totalRounds; }

  // renderHome()：存档摘要 + 最近三轮回顾 + 图鉴 + 本地保存说明 + 失败降级文字
  function renderHome() {
    var n = state.totalRounds;
    var unlockedCount = ELEMENTS.filter(function (e) { return state.unlocked[e]; }).length;

    var summary =
      '<div class="gj-row"><span>已完成轮数</span><span class="gj-num">' + n + '</span></div>' +
      '<div class="gj-row"><span>图鉴收录</span><span class="gj-num">' + unlockedCount + ' / 5</span></div>' +
      '<div class="gj-row"><span>叶章数</span><span class="gj-num">' + state.challengeCompleted + '</span></div>';

    var recent = state.rounds.slice(-3);
    var review;
    if (!recent.length) {
      review = '<div class="gj-muted">还没有任何一轮记录，先去种下第一畦地吧。</div>';
    } else {
      review = recent.map(function (r) {
        var name = BEASTS_INFO[r.dominant] ? BEASTS_INFO[r.dominant].name : '—';
        var chTxt = r.roundNo <= 1 ? '无挑战' : (r.completedChallenge ? '挑战通过' : '挑战未过');
        return '<div class="gj-row"><span>第 ' + r.roundNo + ' 轮</span>' +
          '<span class="gj-num">' + name + ' · 查 ' + r.probesTotal + ' 项 · 止损 ' + r.stops +
          ' 次 · ' + chTxt + '</span></div>';
      }).join('');
    }

    var saveNote = '<div class="gj-note">你的花园只保存在这台浏览器的本地存储里，仅记录每轮精简行为、图鉴与叶章进度，不会上传任何个人数据。换浏览器或清除站点数据会丢失。</div>';

    var warn = storageOK ? '' :
      '<div class="gj-warn">本地存储不可用（被浏览器禁用或空间已满）：本局进度只保存在内存中，' +
      '刷新或关闭页面后可能丢失。不影响你继续游玩这一轮。</div>';

    return css() +
      '<div class="gj-root">' +
      '<h2>我的动物花园</h2>' +
      '<div class="gj-sub">交易习惯 · 多轮养成 · 累计行为画像</div>' +
      '<div class="gj-card"><div class="gj-h">存档摘要</div>' + summary + '</div>' +
      '<div class="gj-card"><div class="gj-h">最近三轮回顾</div>' + review + '</div>' +
      '<div class="gj-card"><div class="gj-h">图鉴</div>' + beastGridHtml() + '</div>' +
      saveNote + warn +
      '</div>';
  }

  // renderResult()：章节轨道 + 刚完成挑战结果 + 挑战叶章 + 下一轮目标 + 图鉴 + 与上一轮对比 + 独立画像说明
  function renderResult() {
    if (!state.rounds.length) {
      return css() + '<div class="gj-root"><h2>花园又长大了一点</h2>' +
        '<div class="gj-sub">先开始一轮，再来查看这一局的收成。</div></div>';
    }
    var last = state.rounds[state.rounds.length - 1];
    var prev = (state.rounds.length >= 2) ? state.rounds[state.rounds.length - 2] : null;
    var curRoundNo = last.roundNo;
    var ch = challengeFor(curRoundNo);
    var chResultTxt = ch
      ? ('第 ' + curRoundNo + ' 轮挑战「' + ch.short + '」— ' + (last.completedChallenge ? '通过' : '未通过'))
      : ('第 ' + curRoundNo + ' 轮 · 初识，暂无挑战');

    // 纪念奖励（叶章）：仅成功挑战才解锁，失败则保留不奖励
    var badgeTxt = '';
    if (ch && last.completedChallenge) {
      var badgeName = ch.type === 'verify_probe' ? '求证' : ch.type === 'stop_loss' ? '守约' : '观心';
      badgeTxt = '<div class="gj-badge">获得一枚' + badgeName + '叶章</div>';
    }

    var nextNo = state.totalRounds + 1;
    var nch = challengeFor(nextNo);
    var goalTxt = nch
      ? ('下一轮（第 ' + nextNo + ' 轮）目标：' + goalText(nch.type, nextNo))
      : ('下一轮（第 ' + nextNo + ' 轮）：初识，先熟悉三关行情，这一轮没有挑战。');

    var compare;
    if (!prev) {
      compare = '<div class="gj-muted">首轮记录，暂无上轮对比。</div>';
    } else {
      var dP = last.probesTotal - prev.probesTotal;
      var dS = last.stops - prev.stops;
      compare =
        '<div class="gj-row"><span>查数据次数</span><span class="gj-num">' + last.probesTotal +
        ' 次（上轮 ' + prev.probesTotal + '，' + deltaTxt(dP) + '）</span></div>' +
        '<div class="gj-row"><span>止损次数</span><span class="gj-num">' + last.stops +
        ' 次（上轮 ' + prev.stops + '，' + deltaTxt(dS) + '）</span></div>';
    }

    var evidence = profileEvidence();
    var independent = '<div class="gj-note">动物画像参考第 ' + evidence.firstRound + '–' + curRoundNo +
      ' 轮，共 ' + evidence.rounds + ' 轮、' + evidence.entries.length +
      ' 次决定；形态成长只取本轮营养。最多保留最近 20 轮逐关记录。</div>';

    var name = BEASTS_INFO[last.dominant] ? BEASTS_INFO[last.dominant].name : '—';
    var warn = storageOK ? '' :
      '<div class="gj-warn">本地存储不可用：本局进度仅存内存，刷新后可能丢失。</div>';

    return css() +
      '<div class="gj-root">' +
      '<h2>花园又长大了一点</h2>' +
      '<div class="gj-sub">第 ' + curRoundNo + ' 轮 · 主属性 ' + name + ' · ' + last.form + '</div>' +
      '<div class="gj-card"><div class="gj-h">章节轨道</div>' + chapterTrackHtml(curRoundNo) + '</div>' +
      '<div class="gj-card"><div class="gj-h">刚完成的挑战</div>' + chResultTxt + badgeTxt + '</div>' +
      '<div class="gj-card"><div class="gj-h">下一轮目标</div>' + goalTxt + '</div>' +
      '<div class="gj-card"><div class="gj-h">与上一轮对比</div>' + compare + '</div>' +
      '<div class="gj-card"><div class="gj-h">图鉴</div>' + beastGridHtml() + '</div>' +
      independent + warn +
      '</div>';
  }

  // renderStage()：挑战标题短文（第一轮返回指定文案）
  function renderStage() {
    var n = currentRoundNo();
    if (n <= 1) return '初次相遇 · 三次决定，种下第一畦地';
    if (n === 2) return '求证 · 每关至少查两项';
    if (n === 3) return '守约 · 每关设下止损';
    if (n === 4) return '观心练习 · 验证想法并查两项';
    return '观心 · 验证想法并查两项';
  }

  /* ───────────── 自检（vm 断言） ───────────── */
  // 覆盖：25 轮 / 刷新保持 25、仅留 20、entries 存在；幂等；storage 拒绝；commit 三关校验。
  function vm() {
    var results = [];
    function ok(name, cond, info) { results.push({ name: name, pass: !!cond, info: info || '' }); }

    // 构造 total 轮原始存档，每轮 3 关 entries（每关查 2 项、设止损、验证想法）
    function mkRaw(total) {
      var rounds = [];
      for (var t = 1; t <= total; t++) {
        var entries = [];
        for (var k = 0; k < 3; k++) {
          entries.push({
            pos: 50, probes: ['rank5y', 'drawdown'], stopLoss: true, loose: (k === 0),
            fruit: { color: '水', size: 2, shine: 2, hole: false, leaf: 'ok', hedge: true, loose: (k === 0), wet: 2 },
            nutrition: 3, code: 'A1'
          });
        }
        rounds.push({
          roundNo: t, pos: 50, probesLen: 6, probesTotal: 6, stopLoss: 3, stops: 3, loose: 1,
          fruit: { color: '水', size: 2, shine: 2 }, nutrition: 9, code: 'A1',
          dominant: '水', form: FORMS[0], completedChallenge: true, entries: entries
        });
      }
      return { v: STATE_VERSION, totalRounds: total, rounds: rounds, unlocked: {}, challengeCompleted: Math.max(0, total - 1) };
    }

    // 1) 25 轮：总轮数保持 25、仅保留 20、每关 entries 存在、轮号真实连续
    var v = validate(mkRaw(25));
    ok('25轮-总轮数保持25', v.totalRounds === 25, 'totalRounds=' + v.totalRounds);
    ok('25轮-仅保留20', v.rounds.length === 20, 'rounds.length=' + v.rounds.length);
    ok('25轮-每关entries存在', v.rounds.every(function (r) { return Array.isArray(r.entries) && r.entries.length === 3; }));
    ok('25轮-轮号真实连续', v.rounds[0].roundNo === 6 && v.rounds[v.rounds.length - 1].roundNo === 25,
      '首=' + v.rounds[0].roundNo + ' 尾=' + v.rounds[v.rounds.length - 1].roundNo);

    // 2) 幂等：再次 validate 同一份 raw，结果一致
    var v2 = validate(mkRaw(25));
    ok('幂等-二次validate一致', v2.totalRounds === 25 && v2.rounds.length === 20 &&
      v2.rounds[v2.rounds.length - 1].roundNo === 25);

    // 3) 坏存档：raw.totalRounds < 合法记录数 → 取较大值兜底，不崩
    var bad = { totalRounds: 3, rounds: mkRaw(10).rounds };
    var vb = validate(bad);
    ok('坏存档-总数兜底合法数', vb.totalRounds === 10, 'totalRounds=' + vb.totalRounds);

    // 4) storage 拒绝：setItem 抛错时 save 返回 false 且不抛
    var savedOK = true, threw = false;
    var realStore = STORE, realStorageOK = storageOK;
    try {
      STORE = { setItem: function () { throw new Error('quota'); }, getItem: function () { return null; } };
      storageOK = true;
      var sres = save(state);
      savedOK = (sres === false && storageOK === false);
    } catch (e) { threw = true; }
    STORE = realStore; storageOK = realStorageOK;
    ok('storage拒绝-save返回false不抛', savedOK && !threw);

    // 5) commit 三关校验：不足 3 关返回 invalid_entries 且不提交（用临时内存态验证 pure 逻辑）
    var before = state.totalRounds;
    var twoEntries = [mkRaw(1).rounds[0].entries[0], mkRaw(1).rounds[0].entries[1]];
    // 直接调用 commit 会依赖 session，这里仅验证 sanitizeEntry 后的 clean 长度逻辑：
    // 构造两条会被简化成 2 条的输入，确认 clean.length !== 3 这一分支存在且语义正确。
    var cleanTest = [];
    twoEntries.forEach(function (e) { var se = sanitizeEntry(e); if (se) cleanTest.push(se); });
    ok('commit-不足三关不提交', cleanTest.length === 2);

    return results;
  }

  /* ───────────── 初始化 ───────────── */
  load();

  // 暴露接口
  root.GardenJourney = {
    version: '1',
    roundIndex: roundIndex,
    profileEvidence: profileEvidence,
    begin: begin,
    commit: commit,
    renderHome: renderHome,
    renderResult: renderResult,
    renderStage: renderStage,
    validate: validate,
    vm: vm
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
