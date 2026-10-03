"""Generate the t9 fixture: 150 vendor agreements (~165k tokens), each with one planted clause that is clearly the
riskiest for Customer. Big enough that reading everything in the main thread costs more than delegating."""
import json, random
from pathlib import Path
from make_t6 import FILLER, NOTICE, RENEW_NO, RENEW_YES, WORDS

random.seed(9)
HERE = Path(__file__).parent
OUT = HERE / "fixtures" / "t9_review150" / "contracts"
FIRST = ["Acorn", "Birch", "Cobalt", "Dunmore", "Elm", "Fair", "Granite", "Harbor", "Iron", "Juniper", "Kestrel", "Linden",
         "Marlow", "North", "Oak"]
SECOND = ["Logistics", "Foods", "Printing", "Security", "Cleaning", "IT", "Couriers", "Staffing", "Legal", "Catering"]
RISKS = {
    "liability": ["Customer's liability under this Agreement is unlimited, while Supplier's total liability is capped at USD 1,000.",
                  "Supplier excludes all liability for loss of data or profits, but Customer indemnifies Supplier without limit."],
    "price": ["Supplier may increase the fees at any time by up to twenty-five percent (25%) on fourteen (14) days' notice.",
              "Supplier may revise its rates every quarter at its sole discretion, and revised rates apply immediately."],
    "exclusivity": ["Customer shall buy such services exclusively from Supplier for the Term and two (2) years thereafter.",
                    "Customer may not engage any other provider of similar services while this Agreement is in force."],
    "ip": ["All intellectual property in deliverables, including reports built from Customer data, vests in Supplier.",
           "Supplier retains ownership of every deliverable and grants Customer only a revocable licence to use it."],
    "data": ["Supplier may share Customer data, including personal data, with third parties for Supplier's own purposes.",
             "Supplier may sell aggregated and individual-level Customer data to its partners without further consent."],
    "termination": ["If Customer terminates early, Customer shall pay all fees for the rest of the Term plus a 50% early termination fee.",
                    "Early termination by Customer triggers a penalty equal to twelve (12) months of fees, payable within seven days."],
}
OUT.mkdir(parents=True, exist_ok=True)
answers = {}
vendors = [f"{a} {b}" for a in FIRST for b in SECOND]
for i, v in enumerate(vendors, 1):
    days = random.choice(list(WORDS)); renews = random.random() < 0.5; risk = random.choice(list(RISKS))
    answers[v] = risk
    clauses = random.sample(FILLER, 10)
    clauses.insert(random.randint(3, 6), random.choice(RENEW_YES if renews else RENEW_NO))
    clauses.insert(random.randint(7, 10), random.choice(NOTICE).format(w=WORDS[days]))
    clauses.insert(random.randint(1, 11), random.choice(RISKS[risk]))
    head = f"MASTER SERVICES AGREEMENT\n\nBetween {v} (\"Supplier\") and Acme Reports LLC (\"Customer\").\nAgreement no. MSA-{2025000 + i}\n\n"
    body = "\n\n".join(f"{n}. {c} " + " ".join(random.sample(FILLER, 2)) for n, c in enumerate(clauses, 1))
    (OUT / f"msa_{i:03d}.txt").write_text(head + body + "\n", encoding="utf-8")
(HERE / "answer_t9.json").write_text(json.dumps(answers, indent=1))
