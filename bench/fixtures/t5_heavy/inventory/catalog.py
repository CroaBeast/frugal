CATALOG = {
    "A100": {"price": 12.50, "bulk_min": 10, "bulk_discount": 0.10},
    "B200": {"price": 4.00, "bulk_min": 25, "bulk_discount": 0.05},
}


def get_item(sku):
    return CATALOG[sku]
