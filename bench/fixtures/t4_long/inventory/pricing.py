from .catalog import get_item


def line_total(sku, qty):
    item = get_item(sku)
    total = item["price"] * qty
    if qty > item["bulk_min"]:
        total = total * (1 - item["bulk_discount"])
    return round(total, 2)
