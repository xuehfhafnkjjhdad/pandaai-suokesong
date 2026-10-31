# -*- coding: utf-8 -*-
"""投资者/股东维度数据实测"""
import os
import panda_data, inspect
panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

def t(name, **kw):
    fn = getattr(panda_data, name, None)
    if fn is None:
        print(f"[NOFN] {name}")
        return
    try:
        df = fn(**kw)
        if hasattr(df, "shape"):
            print(f"[OK] {name} shape={df.shape}")
            print("     cols:", list(df.columns))
            if len(df):
                print("     row0:", dict(list(df.iloc[0].to_dict().items())[:14]))
        else:
            print(f"[OK] {name} -> {df}")
    except Exception as e:
        print(f"[FAIL] {name}: {e}")

# A股股东
t("get_holder_count", symbol=["000001.SZ"], start_date="20240101", end_date="20251231")
t("get_top_holders", symbol=["000001.SZ"], start_date="20240101", end_date="20251231")
t("get_stock_shareholder_change", symbol=["000001.SZ"], start_date="20240101", end_date="20251231")
t("get_stock_pledge", symbol=["000001.SZ"], start_date="20240101", end_date="20251231")
t("get_investor_activity", symbol=["000001.SZ"], start_date="20240101", end_date="20251231")

# 港美股投资者
t("get_stock_investor_concentration", symbol=["80700.HK"])
t("get_stock_investor_ranking", symbol=["80700.HK"])
t("get_stock_insider_trade", symbol=["80700.HK"])
t("get_stock_shareholder_holding", symbol=["80700.HK"])

t("get_stock_investor_centralization", symbol=["AAPL.US"])
t("get_stock_insider_transaction", symbol=["AAPL.US"])

# 一致预期（分析师=机构用户观点）
t("get_stock_recommendation_consensus", symbol=["80700.HK"])
t("get_stock_recommendation_estimate", symbol=["AAPL.US"])

# 期货席位（机构账户）
t("get_broker_profit_rank", underlying_symbol="RB", start_date="20250101", end_date="20250110")
t("get_broker_build_process", underlying_symbol="RB", start_date="20250101", end_date="20250110")
