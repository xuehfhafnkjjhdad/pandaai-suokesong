# -*- coding: utf-8 -*-
"""导出 panda_data 全部接口的真实参数签名"""
import inspect, json, panda_data

rows = []
for name in dir(panda_data):
    if not (name.startswith("get_") or name.startswith("init_") or name.startswith("Ws")):
        continue
    obj = getattr(panda_data, name)
    if not callable(obj):
        continue
    try:
        sig = inspect.signature(obj)
        params = []
        for p in sig.parameters.values():
            if p.name in ("self", "args", "kwargs"):
                continue
            params.append({
                "name": p.name,
                "required": p.default is inspect.Parameter.empty,
                "default": None if p.default is inspect.Parameter.empty else str(p.default),
            })
        doc = (inspect.getdoc(obj) or "").strip().splitlines()
        rows.append({"func": name, "params": params, "doc": doc[0] if doc else ""})
    except Exception as e:
        rows.append({"func": name, "params": [], "doc": f"ERR {e}"})

rows.sort(key=lambda r: r["func"])
with open("E:/pandaAI/pandadata_signatures.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)

print("total funcs:", len(rows))

# 打印参数名分布统计，看统一的命名习惯
from collections import Counter
c = Counter()
for r in rows:
    for p in r["params"]:
        c[p["name"]] += 1
print("\n最多出现的参数名:")
for k, v in c.most_common(25):
    print(f"  {k}: {v}")

# 抽样打印几个关键接口签名
print("\n关键接口签名样例:")
for want in ["get_lhb_list", "get_margin", "get_fina_reports", "get_broker_netmarg",
             "get_future_basis", "get_macro_detail", "get_factor", "get_adj_factor"]:
    for r in rows:
        if r["func"] == want:
            ps = ", ".join(f"{p['name']}{'*' if p['required'] else '='+str(p['default'])}" for p in r["params"])
            print(f"  {want}({ps})")
