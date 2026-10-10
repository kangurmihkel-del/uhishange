# ADR 0005: Supplier fee on final contract value

Status: accepted by maintainer instruction on 2026-10-10 (“pane mõistlik teenustasu”). This decision supersedes the original pilot's deposit-only fee for agreements first accepted after this update. It does not reprice accepted history.

## Decision

New agreements charge the supplier 4% of each continuing association's final gross contract value, with a EUR 10 minimum per contract. The fee is a final gross amount; VAT, if applicable, is included rather than added on top. The buyer pays the accepted gross service price and credits the full gross deposit, with no added platform charge.

At successful deadline finalization the fee is deducted from the retained deposit and the remainder is allocated to the supplier. Deposit coverage must be sufficient for the largest contract fee across participant tiers, including the minimum. Deposit still cannot exceed the cheapest tier's price. All amounts use integer cents, basis points and nearest-cent rounding. The final achieved tier, not the solo/base price, determines each continuing contract's fee.

Post-success withdrawal before contract finalization leaves no continuing service contract. Its retained deposit keeps the existing 4% deposit allocation without the EUR 10 contract minimum. A withdrawal after an ACTIVE contract has already been finalized retains its existing allocation; no duplicate fee/payout is introduced. Failed groups, late captures and pre-success withdrawals produce full customer refunds and no platform allocation. Administrator-mediated supplier cancellation reverses all allocations and refunds captured deposits as before.

Freeze the fee policy in the procurement and each acceptance snapshot at the first commitment. A policy includes its version, percentage basis points and minimum amount. Legacy snapshots without a policy use the **stored** feeBasisPoints on the deposit with no minimum. Finalization must never substitute the current global rate for accepted pricing. Newly created final snapshots include actual fee and supplier-deposit-payout cents; old snapshots and append-only financial history remain intact.

## Rationale

The original business analysis assumes a 3–5% supplier success fee on full service value; 4% of EUR 100 deposits yielded only EUR 4 regardless of contract value. A EUR 700 contract now generates EUR 28. A EUR 10 minimum limits losses on low-value work while keeping charges near 4% across the current EUR 190–700 demo price range (at EUR 190 it is about 5.26%). This is a chosen pilot tariff, not proven customer willingness or a guarantee that operating costs are covered. [Pricing review](../Business/PricingReview.md) records the scenario assumptions.

PSP charges and real VAT accounting remain deferred because this pilot only simulates funds. Production implementation must explicitly allocate capture, payout, refund and dispute costs without silently reducing promised supplier settlement. Original gross customer refund rules remain binding.

## Acceptance scenarios

- EUR 700 final contract, EUR 100 deposit: EUR 28 platform fee, EUR 72 supplier deposit payout, EUR 100 buyer deposit credit and EUR 600 remaining supplier invoice.
- A later lower tier reduces fee proportionally: EUR 900 to EUR 700 means EUR 36 to EUR 28; best-price history remains monotone.
- EUR 190 final contract: EUR 10 minimum, not EUR 7.60. Deposit below the maximum tier fee is rejected before acceptance.
- A new post-success withdrawal before finalization with a EUR 100 retained deposit allocates EUR 4, with no service contract or EUR 10 minimum.
- A legacy EUR 100 deposit with stored 400 basis points still allocates EUR 4 after upgrade; a legacy non-default stored rate remains authoritative.
- Duplicate deadline jobs and provider confirmations cannot duplicate fees or payouts. Supplier cancellation reverses the exact original allocations, including minimum fees.
- Buyer/supplier screens disclose current versus frozen legacy terms and show localized gross amounts. Final contract evidence separately shows fee, supplier payout and full deposit credit.
- Existing organizations, commitments, acceptance/final snapshots, TEST ledger/audit and recorded historical media survive the upgrade.
