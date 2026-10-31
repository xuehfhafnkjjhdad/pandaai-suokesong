# -*- coding: utf-8 -*-
"""把签名 JSON 转成按板块分组的 Markdown 速查表"""
import json, re

rows = json.load(open("E:/pandaAI/pandadata_signatures.json", encoding="utf-8"))

def bucket(f):
    if f.startswith("Ws"):
        return "实时行情 (WebSocket)"
    if f.startswith("init_"):
        return "认证"
    if re.match(r"get_(macro)", f):
        return "宏观数据"
    if re.match(r"get_(hk|us)_", f):
        return "港美股 / 港美ETF·指数·轮证"
    if re.search(r"_(hk|us)_", f) or re.search(r"^(get_stock_(dividend_event|market_event|meeting_event|financial_event|ir_event|dividend_activity|market_activity|meeting_activity|financial_activity|ir_activity|investor_concentration|top20_concentration|investor_ranking|insider_trade|shareholder_holding|investor_centralization|top20_centralization|investor_leaderboard|insider_transaction|shareholder_report|industry_median|pv_indicator|sector_median|pv_metric|ncycl_consensus|recommendation_consensus|ncycl_estimate|recommendation_estimate|operating_indicator|mktfin_indicator|operating_metric|mktfin_metric))$", f):
        return "港美股 / 港美ETF·指数·轮证"
    if re.match(r"get_(fund|fina_statement|fina_ex)", f):
        return "基金数据"
    if re.match(r"get_(future|broker)", f):
        return "期货数据（含 DeepView 席位）"
    if re.match(r"get_option", f):
        return "期权数据"
    if re.match(r"get_(factor|adj_factor|rf_rate)", f):
        return "量化因子 / Barra"
    if re.match(r"get_(bond|stock_preferred|stock_issuer)", f):
        return "可转债 / 优先股"
    if re.match(r"get_(trade|prev_trade|last_trade|stock_status|st_list|suspended)", f):
        return "交易工具"
    if re.match(r"get_(stock|index|industry|concept|lhb|margin|hsgt|investor|restricted|holder|repurchase|top_holders|block|share|fina|audit|cumu|rf)", f):
        return "A股数据"
    return "其他"

groups = {}
for r in rows:
    groups.setdefault(bucket(r["func"]), []).append(r)

order = ["认证", "交易工具", "A股数据", "期货数据（含 DeepView 席位）", "期权数据",
         "量化因子 / Barra", "港美股 / 港美ETF·指数·轮证", "宏观数据", "基金数据",
         "可转债 / 优先股", "实时行情 (WebSocket)", "其他"]

lines = ["# PandaData 全量接口速查表", "",
         f"> 由 SDK v1.0.5 反射生成，共 **{len(rows)}** 个可调用对象。",
         "> 标记 `*` 为必填参数。省略号参数为 `=None` 可选。", ""]

lines.append("## 分组统计\n")
lines.append("| 板块 | 接口数 |")
lines.append("|---|---|")
for g in order:
    if g in groups:
        lines.append(f"| {g} | {len(groups[g])} |")
lines.append("")

for g in order:
    if g not in groups:
        continue
    lines.append(f"## {g}（{len(groups[g])}）\n")
    lines.append("| 接口 | 参数 | 说明 |")
    lines.append("|---|---|---|")
    for r in sorted(groups[g], key=lambda x: x["func"]):
        parts = []
        for p in r["params"]:
            if p["required"]:
                parts.append(f"`{p['name']}`*")
            elif p["default"] not in ("None", ""):
                parts.append(f"`{p['name']}`={p['default']}")
            else:
                parts.append(f"`{p['name']}`")
        sig = ", ".join(parts) if parts else "—"
        doc = (r["doc"] or "").replace("|", "/")[:40]
        lines.append(f"| `{r['func']}` | {sig} | {doc} |")
    lines.append("")

open("E:/pandaAI/PandaData_接口速查表.md", "w", encoding="utf-8").write("\n".join(lines))
print("written, sections:", len([g for g in order if g in groups]))
for g in order:
    if g in groups:
        print(f"  {g}: {len(groups[g])}")
