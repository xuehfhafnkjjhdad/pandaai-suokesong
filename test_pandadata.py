# -*- coding: utf-8 -*-
"""PandaData SDK 连通性与数据可用性探测"""
import os
import sys, json, traceback

import panda_data

USERNAME = os.environ["PD_U"]
PASSWORD = os.environ["PD_P"]

def show(name, fn, **kw):
    try:
        df = fn(**kw)
        if hasattr(df, "shape"):
            print(f"[OK] {name}  shape={df.shape}")
            cols = list(df.columns)
            print("     columns:", cols)
            if len(df):
                print("     sample:", df.head(2).to_dict("records"))
        else:
            print(f"[OK] {name}  type={type(df)} value={str(df)[:300]}")
        return True
    except Exception as e:
        print(f"[FAIL] {name}  {type(e).__name__}: {e}")
        return False

def main():
    print("panda_data version:", getattr(panda_data, "__version__", "unknown"))
    try:
        panda_data.init_token(username=USERNAME, password=PASSWORD)
        print("[OK] init_token")
    except Exception as e:
        print("[FAIL] init_token:", e)
        traceback.print_exc()
        return

    tests = [
        ("交易日历 get_trade_cal", panda_data.get_trade_cal, dict(start_date="20250101", end_date="20250131")),
        ("最新交易日 get_last_trade_date", panda_data.get_last_trade_date, dict()),
        ("A股日线 get_stock_daily", panda_data.get_stock_daily,
         dict(symbol=["000001.SZ"], start_date="20250101", end_date="20250110",
              fields=["open", "high", "low", "close", "volume"])),
        ("A股基本信息 get_stock_detail", panda_data.get_stock_detail, dict(symbol=["000001.SZ"])),
        ("指数日线 get_index_daily", panda_data.get_index_daily,
         dict(symbol=["000300.SH"], start_date="20250101", end_date="20250110")),
        ("期货日线 get_future_daily", panda_data.get_future_daily,
         dict(symbol=["RB2505.SHF"], start_date="20250101", end_date="20250110")),
        ("港股日线 get_hk_daily", panda_data.get_hk_daily,
         dict(symbol=["00700.HK"], start_date="20250101", end_date="20250110")),
        ("美股日线 get_us_daily", panda_data.get_us_daily,
         dict(symbol=["AAPL.US"], start_date="20250101", end_date="20250110")),
        ("基金净值 get_fund_nav", panda_data.get_fund_nav, dict(symbol=["510300.SH"])),
        ("宏观指标列表 get_macro_detail", panda_data.get_macro_detail, dict()),
    ]

    ok = 0
    for name, fn, kw in tests:
        if show(name, fn, **kw):
            ok += 1
    print(f"\n=== 成功 {ok}/{len(tests)} ===")

if __name__ == "__main__":
    main()
