# -*- coding: utf-8 -*-
"""实时性探测：日线/分钟线/逐笔推送的新鲜度"""
import os
import time, datetime
import panda_data

panda_data.init_token(username=os.environ["PD_U"], password=os.environ["PD_P"])

now = datetime.datetime.now()
print("=" * 60)
print("本机时间:", now.strftime("%Y-%m-%d %H:%M:%S"), "周" + "一二三四五六日"[now.weekday()])

print("\n[1] get_last_trade_date ->", panda_data.get_last_trade_date())

cal = panda_data.get_trade_cal(start_date="20261026", end_date="20261101")
print("\n[2] 本周交易日历:")
print(cal.to_string(index=False))

d = panda_data.get_stock_daily(symbol=["000001.SZ", "600519.SH"],
                               start_date="20261020", end_date="20261031",
                               fields=["close", "volume"])
print("\n[3] 日线: 最新日期 =", d["date"].max(), "| 行数 =", len(d))
print(d.tail(4).to_string(index=False))

for freq, tag in [("1m", "1分钟"), ("5m", "5分钟")]:
    try:
        m = panda_data.get_stock_min(symbol=["000001.SZ"],
                                     start_date="20261030", end_date="20261031",
                                     frequency=freq)
        if len(m):
            print(f"\n[4] {tag}线 行数={len(m)} 列={list(m.columns)}")
            print(m.tail(3).to_string(index=False))
        else:
            print(f"\n[4] {tag}线 空")
    except Exception as e:
        print(f"\n[4] {tag}线 FAIL {e}")

print("\n[5] WebSocket 逐笔通道（订阅 15 秒）...")
got = []
try:
    client = panda_data.TickStreamClient(market="cn")

    def on_tick(data):
        got.append(data)
        if len(got) <= 3:
            print("    tick:", str(data)[:200])

    client.subscribe_tick(["000001.SZ", "600519.SH"])
    client.listen(handler=on_tick, block=False)
    print("    已订阅:", client.subscribed_symbols if hasattr(client, "subscribed_symbols") else "?")
    for i in range(15):
        time.sleep(1)
        if i % 5 == 4:
            print(f"    {i+1}s 收到 tick {len(got)} 条 | stats={client.get_stats()}")
    client.close()
    print("    通道已关闭，总计收到:", len(got), "条")
except Exception as e:
    print("    异常:", type(e).__name__, e)
