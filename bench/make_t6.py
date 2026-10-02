"""Generate the t6 fixture: 30 vendor agreements whose notice period and renewal terms are worded differently."""
import json, random
from pathlib import Path

random.seed(6)
HERE = Path(__file__).parent
OUT = HERE / "fixtures" / "t6_contracts" / "contracts"
VENDORS = ["Acorn Logistics", "Birchway Foods", "Cobalt Printing", "Dunmore Security", "Elmstead Cleaning", "Fairlight IT",
           "Granite Couriers", "Harbor Staffing", "Ironbridge Legal", "Juniper Catering", "Kestrel Telecom", "Lindale Waste",
           "Marlow Facilities", "Northfield Insurance", "Oakridge Software", "Pinecrest Travel", "Quarry Office Supply",
           "Redfern Marketing", "Stonegate Payroll", "Thistle Translation", "Upland Fleet", "Vantage Analytics",
           "Willow HVAC", "Yarrow Design", "Zephyr Hosting", "Alder Medical", "Bramble Events", "Cedar Utilities",
           "Driftwood Media", "Ember Training"]
WORDS = {30: "thirty (30) days", 45: "forty-five (45) days", 60: "sixty (60) days", 90: "ninety (90) days",
         120: "one hundred twenty (120) days", 180: "six (6) months"}
NOTICE = [
    "Either party may terminate this Agreement for convenience by giving the other party not less than {w} prior written notice.",
    "This Agreement may be terminated by either party upon {w} written notice delivered to the address set out above.",
    "Termination for convenience requires written notice of at least {w}, which period shall run from the date of receipt.",
    "Customer may end this Agreement at any time, provided that it notifies Supplier in writing {w} in advance.",
]
RENEW_YES = [
    "Upon expiry of the Initial Term, this Agreement shall automatically renew for successive periods of twelve (12) months.",
    "Unless terminated in accordance with Clause 9, the Term will roll over for further one-year periods.",
    "This Agreement continues on a year-to-year basis after the Initial Term until terminated by either party.",
]
RENEW_NO = [
    "This Agreement expires at the end of the Initial Term and does not renew unless the parties sign a new agreement.",
    "No automatic renewal applies; any extension of the Term must be agreed in writing by both parties.",
    "Upon expiry of the Initial Term this Agreement shall terminate, and Supplier shall not be entitled to any extension.",
]
FILLER = [
    "Supplier shall perform the Services with reasonable skill and care and in accordance with good industry practice.",
    "All invoices are payable within thirty (30) days of receipt, and late payments accrue interest at 2% per month.",
    "Each party shall keep confidential all information disclosed by the other party, for the Term and five years thereafter.",
    "Neither party's liability under this Agreement shall exceed the total fees paid in the twelve months before the claim.",
    "Supplier shall maintain insurance with a reputable insurer, including public liability cover of not less than USD 1,000,000.",
    "This Agreement is governed by the laws of the State of Delaware, and the parties submit to its courts.",
    "Any notice under this Agreement must be in writing and sent by courier or email to the contacts set out in Schedule 1.",
    "Supplier shall comply with all applicable anti-bribery, data protection, and modern slavery laws.",
    "Neither party is liable for delay caused by events beyond its reasonable control, provided it notifies the other promptly.",
    "Customer may audit Supplier's records relating to the Services once per year on fifteen (15) business days' notice.",
    "Supplier shall not subcontract any part of the Services without Customer's prior written consent.",
    "Intellectual property in deliverables created specifically for Customer vests in Customer upon payment.",
]
answers = {}
for i, v in enumerate(VENDORS, 1):
    days = random.choice(list(WORDS)); renews = random.random() < 0.5
    answers[v] = {"notice_days": days, "auto_renews": "yes" if renews else "no"}
    clauses = random.sample(FILLER, 10)
    clauses.insert(random.randint(3, 6), random.choice(RENEW_YES if renews else RENEW_NO))
    clauses.insert(random.randint(7, 10), random.choice(NOTICE).format(w=WORDS[days]))
    head = f"MASTER SERVICES AGREEMENT\n\nBetween {v} (\"Supplier\") and Acme Reports LLC (\"Customer\").\nAgreement no. MSA-{2024000 + i}\n\n"
    body = "\n\n".join(f"{n}. {c} " + " ".join(random.sample(FILLER, 2)) for n, c in enumerate(clauses, 1))
    (OUT / f"msa_{i:02d}.txt").write_text(head + body + "\n", encoding="utf-8")
(HERE / "answer_t6.json").write_text(json.dumps(answers, indent=1))
