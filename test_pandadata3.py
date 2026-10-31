# -*- coding: utf-8 -*-
import os
import panda_data
panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

def show(n, fn, **kw):
    try:
        df = fn(**kw)
        print(f"[OK] {n} shape={getattr(df,'shape',None)}")
        if hasattr(df, "iloc") and len(df):
            print("     cols:", list(df.columns)[:20])
            print("     row0:", {k: v for k, v in list(df.iloc[0].to_dict().items())[:10]})
    except Exception as e:
        print(f"[FAIL] {n} {e}")

show("龙虎榜", panda_data.get_lhb_list, start_date="20250110", end_date="20250110")
show("融资融券", panda_data.get_margin, symbol=["000001.SZ"], start_date="20250101", end_date="20250110")
show("财务季报", panda_data.get_fina_reports, symbol=["000001.SZ"], start_quarter="2024Q1", end_quarter="2024Q3")
show("回测因子", panda_data.get_factor, symbol=["000001.SZ"], start_date="20250101", end_date="20250110", type="stock")
show("期货席位保证金", panda_data.get_broker_netmarg, underlying_symbol="RB", start_date="20250101", end_date="20250110")
show("复权因子", panda_data.get_adj_factor, symbol=["000001.SZ"], start_date="20250101", end_date="20250110")
