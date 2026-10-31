/* 行情驱动出题：输入仅含决策时可见数据，不接收 reveal。 */
(function () {
  'use strict';
  function signed(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function build(snapshot, position, round) {
    var m = snapshot.metrics, rows = snapshot.kline;
    var last = rows[rows.length - 1], prev = rows[rows.length - 2];
    var day = prev ? (last[4] / prev[4] - 1) * 100 : 0;
    var state = day <= -4 ? 'fall' : day >= 4 && m.vol_ratio_20 >= 1.5 ? 'surge' : m.pct_rank_5y <= 20 ? 'low' : 'range';
    var holding = position > 0, alternate = round % 2 === 1;
    var options = [], question, analysis;
    function add(id, label, code, pos, stop) { options.push({id:snapshot.id + '_' + id, label:label, code:code, positionPct:pos, stopLossSet:!!stop}); }
    if (state === 'fall') {
      analysis = '今天下跌 ' + Math.abs(day).toFixed(2) + '%，20日振幅 ' + m.amp_20 + '%。波动放大，单日下跌还不能证明会反弹。';
      question = holding ? '你还持有 ' + position + '% 仓位，面对这次急跌，你准备怎么处理？' : '你目前空仓，面对这次急跌，你会进场吗？';
      if (holding) { add('STOP','执行退出计划，清仓','A1',0,true); add('HOLD','维持 ' + position + '%，等待反弹','A4','keep'); add('ADD','加到100%，摊低成本','E2',100); add('TRIM','先减半，降低波动暴露','A3','half'); }
      else { add('CATCH','用40%仓位尝试反弹','A11',40); add('WAIT','继续空仓，等待企稳证据','A7',0); add('PLAN','设好退出条件，小仓20%试探','D1',20,true); }
    } else if (state === 'surge') {
      analysis = '今天上涨 ' + day.toFixed(2) + '%，量能为20日均量的 ' + m.vol_ratio_20 + ' 倍。涨势加速，同时20日振幅已达 ' + m.amp_20 + '%。';
      question = holding ? '行情放量急涨，你已有 ' + position + '% 仓位，接下来怎么做？' : '行情放量急涨，而你目前空仓。你准备如何回应？';
      if (holding) { add('CHASE','加到100%，跟上这波涨势','A5',100); add('KEEP','维持 ' + position + '%，不追加','A10','keep'); add('HALF','卖出一半，收回部分风险','A3','half'); add('PLAN','维持仓位，并设好退出条件','D1','keep',true); }
      else { add('CHASE','投入60%，立即跟进','A5',60); add('WAIT','继续空仓，等待新证据','A7',0); add('PLAN','设好退出条件，用20%试探','D1',20,true); }
    } else {
      analysis = '价格处于5年 ' + m.pct_rank_5y + '% 分位，近20日涨跌 ' + signed(m.chg_20) + '，量能 ' + m.vol_ratio_20 + ' 倍。' + (state === 'low' ? '位置偏低，但位置本身还不是反转信号。' : '方向仍有分歧，需要区分判断与证据。');
      question = holding ? '已有 ' + position + '% 仓位，你会继续持有还是调整？' : '面对这样的价格位置与量能，你会用什么方式开始？';
      add('LIGHT',alternate ? '先设退出条件，投入40%' : '用20%仓位试探，继续验证',alternate ? 'D1' : 'A6',alternate ? 40 : 20,alternate);
      add('HEAVY','投入80%，押注反转','A9',80);
      add('WAIT','保持空仓，等更明确的证据','A7',0);
    }
    return {state:state, analysis:analysis, question:question, options:options, dayPct:day, date:snapshot.date};
  }
  window.MarketQuestion = {build:build};
})();
