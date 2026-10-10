# ADR 0006: Supplier fee on the deposit

Status: accepted by maintainer instruction on 2026-10-10. For newly accepted agreements this supersedes [ADR 0005](0005-contract-service-fee.md). Previously accepted terms remain authoritative.

## Decision

Charge the supplier 10% of each retained gross deposit, with no minimum. The fee is independent of final service price, area or achieved participant tier. Freeze `deposit-v1`, `basisPoints: 1000` and `minimumCents: 0` at the first commitment and preserve this policy in acceptance snapshots. Gross fees include VAT if applicable.

At successful finalization, deduct the fee from the deposit and allocate the remaining 90% to the supplier. The buyer credits the entire gross deposit against the service price and pays any remaining balance directly to the supplier. The supplier's fixed deposit must remain positive and no greater than the cheapest participant-tier price; no final-price fee coverage requirement applies to this policy.

Post-success retained withdrawals use the same frozen deposit percentage. Withdrawal after finalization preserves the existing allocation. Failure, late captures and pre-success withdrawals still produce full refunds. Administrator-mediated supplier cancellation reverses the exact prior allocations and refunds all captured deposits. Locking, idempotency and append-only history remain unchanged.

Agreements frozen under ADR 0005 retain their 4% final-contract-price fee and EUR 10 minimum. Missing-policy legacy snapshots retain their stored deposit percentage with no minimum. Do not rewrite acceptance/final snapshots, ledger or audit entries.

## Rationale

The maintainer explained that the final price can be uncertain or depend on square metres, and asked to increase the deposit-based fee instead. A 10% deposit fee is predictable at acceptance and increases the original 4% deposit tariff without using an uncertain service value. No minimum is imposed. This does not establish profitability; actual volumes, operating costs and payment costs remain unmeasured. [Pricing review](../Business/PricingReview.md) retains earlier comparisons and adds the current scenario.

## Acceptance scenarios

- EUR 100 deposit: EUR 10 fee and EUR 90 supplier deposit payout, whether the final service price is EUR 900 or EUR 700. On a EUR 700 contract the buyer still has EUR 100 credit and EUR 600 remaining invoice.
- EUR 30 deposit: EUR 3 fee, with no EUR 10 minimum. Nearest-cent rounding uses integer cents and basis points.
- A lower achieved participant tier changes the service price and invoice balance but not the deposit fee.
- Frozen ADR 0005 and original deposit-fee agreements retain their respective pricing, including cancellation reversals.
- Duplicate payment/deadline events and withdrawals cannot allocate a second fee or payout.

The maintainer requested a quick change without rerunning everything. Run focused fee/compatibility checks, build and analysis; record which broader suites were not rerun in the verification results rather than claiming a new complete acceptance run.
