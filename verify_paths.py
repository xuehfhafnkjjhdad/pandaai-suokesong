# -*- coding: utf-8 -*-
"""
五行画像 · 五条标准路径验算（v0.7.1 计分规则 + 三关脚本 v1.0）

用途：画像引擎的单测基线。任何人改权重后跑一遍，看这五条路径的主五行/形态
是否还符合直觉。不符合就说明改坏了。

运行：python verify_paths.py
"""

# ---------- 1. 行为码 → 五行增量（v0.7.1） ----------
ACTIONS = {
    "A1":  {"metal": +4, "water": +1, "wood": -1},          # 执行止损
    "A2":  {"metal": +2},                                    # 设止损未触发
    "A3":  {"metal": +2, "wood": -1},                        # 按计划止盈
    "A4":  {"earth": +2, "wood": +2, "metal": -2},           # 死扛（浮亏 3-8%）
    "A4b": {"earth": +3, "wood": +2, "metal": -2},           # 死扛（浮亏 >8%）
    "A5":  {"fire": +3, "earth": -2, "metal": -2},           # 追涨加仓
    "A6":  {"water": +2, "fire": +1, "metal": +1},           # 逆势买入
    "A7":  {"water": +1, "earth": +1, "fire": -1},           # 观望
    "A8":  {"earth": +1, "metal": +1, "water": -1},          # 恐慌清仓
    "A9":  {"fire": +2, "water": -1},                        # 无信号强行重仓
    "A10": {"metal": +1, "earth": +1, "fire": -1},           # 按捺不追
    "A11": {"fire": +2, "water": -1},                        # 下跌接飞刀
    "E2":  {"fire": +2, "earth": -2},                        # 重仓+高波动
}

# D 类（纪律），全局或单关
D_META = {"D1": {"metal": +2}, "D3": {"metal": -1}}
# C 类（验证）
C_META = {"C1": {"water": +2}, "C3": {"water": -1}}

B_CAP_PER_STAGE = 1.0   # v0.7 校准：B 类单关上限（原 1.5 → 1.0）
KEYS = ["metal", "water", "wood", "fire", "earth"]
CN = {"metal": "金", "water": "水", "wood": "木", "fire": "火", "earth": "土"}


def b_score(n_viewed):
    """B 类：查 1-2 项 +0.5，≥3 项再 +0.5，单关上限 1.0；0 项 −1 且火 +0.5"""
    if n_viewed == 0:
        return {"water": -1.0, "fire": +0.5}
    s = {"water": 0.5}          # B1
    if n_viewed >= 3:
        s["water"] += 0.5       # B2，合计 1.0（上限）
    return s


def add(acc, delta):
    for k, v in delta.items():
        acc[k] = acc.get(k, 0) + v


def score_path(stages, extra_global=None):
    """
    stages: [{"action": "A6", "viewed": 3, "d": ["D1"], "c": ["C1"]}, ...]
    extra_global: 全局事件，如 ["D3"]
    """
    acc = {k: 0.0 for k in KEYS}
    for st in stages:
        add(acc, ACTIONS.get(st["action"], {}))
        add(acc, b_score(st.get("viewed", 0)))
        for d in st.get("d", []):
            add(acc, D_META.get(d, {}))
        for c in st.get("c", []):
            add(acc, C_META.get(c, {}))
    for g in (extra_global or []):
        add(acc, D_META.get(g, {}))

    raw = dict(acc)
    # 负分仅最终归零
    final = {k: max(0.0, v) for k, v in raw.items()}
    total = sum(final.values())
    pct = {k: (v / total * 100 if total else 0.0) for k, v in final.items()}
    return raw, final, pct


def pick_main(final, pct, last_action_delta):
    """主五行 + tie-break：1) 有 +4 高强度事件 2) 最近贡献 3) 固定顺序"""
    order = ["metal", "water", "wood", "fire", "earth"]
    top = max(pct.values())
    cands = [k for k in order if abs(pct[k] - top) < 1e-9]
    if len(cands) == 1:
        return cands[0], "独高"
    # 规则 1：候选里有没有 +4 级事件
    strong = [k for k in cands if final.get(k, 0) >= 4]
    if len(strong) == 1:
        return strong[0], "tie-break:强度"
    # 规则 2：最近一次动作贡献
    for k in cands:
        if last_action_delta.get(k, 0) > 0:
            return k, "tie-break:最近"
    return cands[0], "tie-break:固定顺序"


def ability(info, verify, disc, risk, know):
    return 0.25 * info + 0.25 * verify + 0.20 * disc + 0.20 * risk + 0.10 * know


def stage_name(a):
    if a >= 70:
        return "定形"
    if a >= 40:
        return "成长期"
    return "潜力态"


PATHS = [
    ("纪律型", [
        {"action": "A6", "viewed": 3, "d": ["D1"]},
        {"action": "A3", "viewed": 3, "d": ["D1"]},
        {"action": "A1", "viewed": 3, "c": ["C1"]},
    ], None, (100, 33, 100, 80, 67), "金"),

    ("追涨型", [
        {"action": "A9", "viewed": 0},
        {"action": "A5", "viewed": 1},
        {"action": "E2", "viewed": 0},
    ], ["D3"], (11, 0, 0, 20, 33), "火"),

    ("守成型", [
        {"action": "A9", "viewed": 2},
        {"action": "A10", "viewed": 2},
        {"action": "A4", "viewed": 2},
    ], ["D3"], (60, 0, 0, 40, 50), "土"),

    ("研究型", [
        {"action": "A7", "viewed": 4, "c": ["C1"]},
        {"action": "A7", "viewed": 3, "c": ["C1"]},
        {"action": "A7", "viewed": 3, "c": ["C1"]},
    ], None, (100, 100, 0, 90, 80), "水"),

    ("反向型", [
        {"action": "A9", "viewed": 1, "d": ["D1"]},
        {"action": "A3", "viewed": 1},
        {"action": "A11", "viewed": 1},
    ], None, (33, 0, 33, 50, 50), "火"),
]

print("=" * 76)
print("五行画像 · 五条标准路径验算（v0.7.1）")
print("=" * 76)
ok_all = True
for name, stages, glob, ab, expect in PATHS:
    raw, final, pct = score_path(stages, glob)
    last = ACTIONS.get(stages[-1]["action"], {})
    main, how = pick_main(final, pct, last)
    a = ability(*ab)
    form = stage_name(a)
    ok = (CN[main] == expect)
    ok_all = ok_all and ok
    print(f"\n【{name}】 预期主五行 {expect}")
    print("  原始累加 : " + "  ".join(f"{CN[k]}{raw[k]:+.1f}" for k in KEYS))
    print("  归零后   : " + "  ".join(f"{CN[k]}{final[k]:.1f}" for k in KEYS)
          + f"   Σ={sum(final.values()):.1f}")
    print("  占比     : " + "  ".join(f"{CN[k]}{pct[k]:.1f}%" for k in KEYS))
    print(f"  主五行   : {CN[main]}  ({how})  {'✅' if ok else '❌ 不符'}")
    print(f"  能力分   : {a:.1f} → {form}")

print("\n" + "=" * 76)
print("全部通过 ✅" if ok_all else "存在不符 ❌ —— 检查权重或路径编码")
print("=" * 76)

# 同时写一份 UTF-8 报告，避免 Windows 控制台编码问题
import io
with io.open("verify_report.txt", "w", encoding="utf-8") as f:
    f.write("五行画像五条路径验算（v0.7.1）\n")
    for name, stages, glob, ab, expect in PATHS:
        raw, final, pct = score_path(stages, glob)
        last = ACTIONS.get(stages[-1]["action"], {})
        main, how = pick_main(final, pct, last)
        a = ability(*ab)
        f.write("\n【%s】预期 %s → 实得 %s (%s) %s\n" % (
            name, expect, CN[main], how, "OK" if CN[main] == expect else "FAIL"))
        f.write("  raw: " + " ".join("%s%+.1f" % (CN[k], raw[k]) for k in KEYS) + "\n")
        f.write("  pct: " + " ".join("%s%.1f%%" % (CN[k], pct[k]) for k in KEYS) + "\n")
        f.write("  ability: %.1f → %s\n" % (a, stage_name(a)))
    f.write("\nALL PASS\n" if ok_all else "\nFAILED\n")

