from .pricing import line_total

TAX = 0.08


def order_total(lines):
    subtotal = sum(line_total(sku, qty) for sku, qty in lines)
    return round(subtotal * (1 + TAX), 2)
