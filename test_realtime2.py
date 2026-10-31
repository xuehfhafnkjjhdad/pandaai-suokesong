# -*- coding: utf-8 -*-
"""实时通道二次测试：quote / tick + 分钟线完整性"""
import os
import time, datetime
import panda_data

panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

# 分钟线是否包含收盘 15:00，且顺序如何
m = panda_data.get_stock_min(symbol=["000001.SZ"], start_date="20261030", end_date="20261030", frequency="1m")
print("[分钟线] 行数:", len(m), "| datetime 最小:", m["datetime"].min(), "最大:", m["datetime"].max())

print("\n" + "=" * 60)
print("[A] QuoteStreamClient 个股摘要推送（20秒）")
msgs = []
try:
    q = panda_data.QuoteStreamClient()
    def on_q(data):
        msgs.append(data)
        if len(msgs) <= 3:
            print("   quote:", str(data)[:300])
    q.subscribe(["000001.SZ", "600519.SH"])
    q.listen(handler=on_q, block=False)
    print("   订阅成功:", q.subscribed_symbols)
    for i in range(20):
        time.sleep(1)
        if i % 5 == 4:
            print(f"   {i+1}s 累计 {len(msgs)} 条")
    q.close()
except Exception as e:
    print("   异常:", type(e).__name__, e)

print("\n" + "=" * 60)
print("[B] TickStreamClient 逐笔推送（20秒，带 tick_CN_ 前缀）")
ticks = []
try:
    t = panda_data.TickStreamClient(market="cn")
    def on_t(data):
        ticks.append(data)
        if len(ticks) <= 3:
            print("   tick:", str(data)[:300])
    t.subscribe_tick(["tick_CN_000001.SZ"])
    t.listen(handler=on_t, block=False)
    for i in range(20):
        time.sleep(1)
        if i % 5 == 4:
            print(f"   {i+1}s 累计 {len(ticks)} 条 | stats={t.get_stats()}")
    t.close()
except Exception as e:
    print("   异常:", type(e).__name__, e)
