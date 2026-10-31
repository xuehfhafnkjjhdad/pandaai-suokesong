# -*- coding: utf-8 -*-
"""
三关快照导出：从 Panda Data 拉真实行情，生成前端可直接消费的 stages.json

设计要点：
  1. visible / reveal 物理隔离（两个独立字段，前端决策前不加载 reveal）
  2. 涨跌幅一律 close.pct_change()（禁用 pre_close，口径不一致）
  3. 所有线索数值在此算好，前端不重算，避免口径漂移
  4. 跑完检查控制台输出的校验值是否与文档一致

用法：
  set PD_U=... & set PD_P=...
  python export_stages.py
输出：
  data/stages.json
"""
import io
import json
import os
from datetime import datetime

import pandas as pd
import panda_data

panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

SYM = "000300.SH"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(OUT_DIR, exist_ok=True)

# 5 年分位基准（单次跨度 ≤5 年，故固定用这段）
BASE_START, BASE_END = "20191021", "20241018"

_cache = {}


def daily(start, end):
    key = (start, end)
    if key not in _cache:
        df = panda_data.get_index_daily(symbol=SYM, start_date=start, end_date=end)
        df = df.copy()
        df["date"] = df["date"].astype(str)
        df = df.sort_values("date").reset_index(drop=True)
        # 涨跌幅：必须用 close 的 pct_change，不能用 pre_close
        df["pct"] = (df["close"].pct_change() * 100).round(2)
        _cache[key] = df
    return _cache[key]


def rows_of(df, start, end):
    sub = df[(df["date"] >= start) & (df["date"] <= end)]
    out = []
    for _, r in sub.iterrows():
        out.append({
            "date": r["date"],
            "open": round(float(r["open"]), 2),
            "high": round(float(r["high"]), 2),
            "low": round(float(r["low"]), 2),
            "close": round(float(r["close"]), 2),
            "volume": float(r["volume"]),
            "amount": float(r["amount"]),
            "pct": None if pd.isna(r["pct"]) else float(r["pct"]),
        })
    return out


def metrics(decision_date, lookback_start):
    """算该决策日的全部线索数值"""
    base = daily(BASE_START, BASE_END)
    hist = base[base["date"] <= decision_date]
    cur = float(hist["close"].iloc[-1])

    pct_rank = round(float((base["close"] <= cur).mean() * 100), 1)

    d3_start = str(int(decision_date[:4]) - 3) + decision_date[4:]
    hi3 = float(base[base["date"] >= d3_start]["close"].max())
    dd3 = round((cur / hi3 - 1) * 100, 1)

    win = daily(lookback_start, decision_date)
    vol_ratio = round(float(win["volume"].iloc[-1] / win["volume"].tail(20).mean()), 2)
    amp20 = round(float(win["high"].tail(20).max() / win["low"].tail(20).min() - 1) * 100, 1)

    chg20 = None
    if len(win) > 20:
        chg20 = round((float(win["close"].iloc[-1]) / float(win["close"].iloc[-21]) - 1) * 100, 2)
    chg5 = None
    if len(win) > 5:
        chg5 = round((float(win["close"].iloc[-1]) / float(win["close"].iloc[-6]) - 1) * 100, 2)

    return {
        "close": round(cur, 2),
        "pct_rank_5y": pct_rank,
        "drawdown_3y": dd3,
        "vol_ratio_20": vol_ratio,
        "amp_20": amp20,
        "chg_20": chg20,
        "chg_5": chg5,
        "high_3y": round(hi3, 2),
    }


def build_stage(sid, name, decision_date, lookback_start, reveal_start, reveal_end,
                action_groups, intent):
    m = metrics(decision_date, lookback_start)
    vis_df = daily(lookback_start, decision_date)
    rev_df = daily(BASE_START, reveal_end)
    rev_rows = rows_of(rev_df, reveal_start, reveal_end)
    end_close = rev_rows[-1]["close"]
    end_pct = round((end_close / m["close"] - 1) * 100, 2)

    return {
        "id": sid,
        "name": name,
        "intent": intent,
        "decision_date": decision_date,
        "symbol": SYM,
        "visible": {
            "kline": rows_of(vis_df, lookback_start, decision_date),
            "metrics": m,
        },
        "actions": action_groups,
        "reveal": {
            "window_start": reveal_start,
            "window_end": reveal_end,
            "kline": rev_rows,
            "end_close": end_close,
            "end_pct": end_pct,
        },
    }


S1 = build_stage(
    "S1", "春·震荡", "20240913", "20240617", "20240916", "20240920",
    {
        "default": [
            {"id": "S1_LIGHT", "label": "轻仓试试（20%）", "code": "A6", "positionPct": 20},
            {"id": "S1_HEAVY", "label": "重仓进场（80%）", "code": "A9", "positionPct": 80},
            {"id": "S1_WAIT", "label": "再看一天", "code": "A7", "positionPct": 0},
        ]
    },
    "测试无明确信号时是否强行入场",
)

S2 = build_stage(
    "S2", "夏·狂热", "20240930", "20240708", "20241008", "20241008",
    {
        "holding": [
            {"id": "S2_ADD", "label": "加仓，全押", "code": "A5", "positionPct": 100},
            {"id": "S2_HOLD", "label": "拿着过节", "code": "A10", "positionPct": "keep"},
            {"id": "S2_HALF", "label": "卖一半，落袋", "code": "A3", "positionPct": "half"},
            {"id": "S2_OUT", "label": "全卖，不玩了", "code": "A3", "positionPct": 0},
        ],
        "empty": [
            {"id": "S2_CHASE", "label": "现在上车（60%）", "code": "A5", "positionPct": 60},
            {"id": "S2_PASS", "label": "还是算了", "code": "A7", "positionPct": 0},
        ],
    },
    "测试追涨自控力与仓位失控",
)

S3 = build_stage(
    "S3", "冬·深跌", "20241009", "20240719", "20241010", "20241016",
    {
        "holding": [
            {"id": "S3_STOP", "label": "按纪律止损", "code": "A1", "positionPct": 0, "stopLossSet": True},
            {"id": "S3_HOLD", "label": "不动，等反弹", "code": "A4", "positionPct": "keep"},
            {"id": "S3_AVG", "label": "加仓摊平成本", "code": "E2", "positionPct": 100},
            {"id": "S3_DUMP", "label": "全部卖出", "code": "A8", "positionPct": 0},
        ],
        "empty": [
            {"id": "S3_CATCH", "label": "跌这么多，买一点", "code": "A11", "positionPct": 40},
            {"id": "S3_AGAIN", "label": "再等等", "code": "A7", "positionPct": 0},
        ],
    },
    "测试损失厌恶与处置效应",
)

doc = {
    "meta": {
        "title": "五行灵兽 · 三关快照",
        "source": "Panda Data SDK v1.0.5",
        "symbol": SYM,
        "symbol_note": "宽基指数，不点具体个股（避免荐股嫌疑）",
        "frequency": "daily",
        "pct_method": "close.pct_change()；不使用 pre_close（未复权，口径不一致）",
        "percentile_base": "%s ~ %s（近 5 年，单次跨度 ≤5 年）" % (BASE_START, BASE_END),
        "exported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": "Asia/Shanghai",
        "isolation": "visible 与 reveal 为两个独立字段；前端决策提交前不得加载 reveal",
        "story": "2024-09-13 → 2024-10-09 同一条真实时间线（924 行情）",
    },
    "stages": [S1, S2, S3],
}

path = os.path.join(OUT_DIR, "stages.json")
with io.open(path, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

# ---- 校验：与《三关关卡脚本 v1.0》文档里的数字逐项比对 ----
expect = {
    "S1": {"close": 3159.25, "pct": -0.42, "rank": 0.1, "end": 3201.05},
    "S2": {"close": 4017.85, "pct": 8.48, "rank": 48.5, "end": 4256.10},
    "S3": {"close": 3955.98, "pct": -7.05, "rank": 41.0, "end": 3831.59},
}
lines = ["=== 导出校验 ==="]
all_ok = True
for st in doc["stages"]:
    sid = st["id"]
    e = expect[sid]
    m = st["visible"]["metrics"]
    day_pct = st["visible"]["kline"][-1]["pct"]
    ok = (abs(m["close"] - e["close"]) < 0.02
          and abs(day_pct - e["pct"]) < 0.02
          and abs(m["pct_rank_5y"] - e["rank"]) < 0.6
          and abs(st["reveal"]["end_close"] - e["end"]) < 0.02)
    all_ok = all_ok and ok
    lines.append("%s %s  close=%.2f(%s)  pct=%+.2f(%s)  rank=%.1f%%(%s)  reveal=%.2f(%s)" % (
        sid, "OK " if ok else "FAIL",
        m["close"], e["close"], day_pct, e["pct"],
        m["pct_rank_5y"], e["rank"],
        st["reveal"]["end_close"], e["end"]))
    lines.append("     vol_ratio=%.2f  amp20=%.1f%%  chg5=%s  chg20=%s  dd3y=%.1f%%" % (
        m["vol_ratio_20"], m["amp_20"], m["chg_5"], m["chg_20"], m["drawdown_3y"]))

lines.append("")
lines.append("ALL OK" if all_ok else "MISMATCH")
lines.append("written: %s (%d bytes)" % (path, os.path.getsize(path)))
io.open(os.path.join(os.path.dirname(path), "export_check.txt"), "w", encoding="utf-8").write(
    "\n".join(lines))
print("\n".join(lines).encode("utf-8").decode("utf-8", "replace"))
