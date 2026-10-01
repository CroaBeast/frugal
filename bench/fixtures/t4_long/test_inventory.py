from inventory.orders import order_total

assert order_total([("A100", 2)]) == 27.0, order_total([("A100", 2)])
assert order_total([("A100", 10)]) == 121.5, order_total([("A100", 10)])
assert order_total([("B200", 25), ("A100", 1)]) == 116.1, order_total([("B200", 25), ("A100", 1)])
print("ok")
