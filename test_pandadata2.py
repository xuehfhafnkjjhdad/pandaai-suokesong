# -*- coding: utf-8 -*-
"""PandaData 第二轮：修正参数 + 各板块权限探测"""
import os
import panda_data

panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

def show(name, fn, **kw):
    try:
        df = fn(**kw)
        if hasattr(df, "shape"):
            print(f"[OK] {name}  shape={df.shape}")
            print("     cols:", list(df.columns)[:24])
            if len(df):
                print("     row0:", df.iloc[0].to_dict())
        else:
            print(f"[OK] {name}  -> {str(df)[:200]}")
    except Exception as e:
        print(f"[FAIL] {name}  {e}")

# 1. 港股：5位代码需以8开头
show("港股日线 80700.HK", panda_data.get_hk_daily,
     symbol=["80700.HK"], start_date="20250101", end_date="20250110")
# 2. 基金净值补 start_date
show("基金净值 510300", panda_data.get_fund_nav,
     symbol=["510300.SH"], start_date="20250101", end_date="20250110")
# 3. 宏观指标列表需 category
for cat in ["na", "in", "pi", "mb"]:
    show(f"宏观列表 category={cat}", panda_data.get_macro_detail, category=cat)

# 4. 因子 / 复权 / Barra
show("复权因子 get_adj_factor", panda_data.get_adj_factor,
     symbol=["000001.SZ"], start_date="20250101", end_date="20250110")
show("Barra风格收益 get_factor_style_return",
     panda_data.get_factor_style_return, start_date="20250101", end_date="20250110")

# 5. 期货 DeepView（席位数据）
show("席位净持仓保证金 get_broker_netmarg", panda_data.get_broker_netmarg,
     trade_date="20250110")
show("期货基差 get_future_basis", panda_data.get_future_basis,
     trade_date="20250110")

# 6. 资金面
show("龙虎榜 get_lhb_list", panda_data.get_lhb_list, trade_date="20250110")
show("融资融券 get_margin", panda_data.get_margin, trade_date="20250110")

# 7. 财务
show("财务季报 get_fina_reports", panda_data.get_fina_reports,
     symbol=["000001.SZ"], start_date="20240101", end_date="20241231")

# 8. 期权
show("期权基本信息 get_option_detail", panda_data.get_option_detail,
     symbol=["10007601.SH"])
