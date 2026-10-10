# Deposit-fee sustainability review

Reviewed: 2026-10-10. Decision owner: project maintainer. The initial review below assesses the original deposit-only fee. During the review the maintainer instructed “pane mõistlik teenustasu”; [ADR 0005](../ADR/0005-contract-service-fee.md) records the resulting accepted tariff. All transactions remain TEST transactions and produce no actual revenue.

## Accepted tariff after review

For new agreements, charge the supplier 4% of the final gross contract price, minimum EUR 10 per association contract. This supersedes the deposit-only model below for newly frozen terms. Existing accepted terms retain their stored pricing. The minimum was chosen at EUR 10 rather than EUR 20 to keep current smaller demo services reasonably close to the intended percentage: a EUR 190 contract pays EUR 10 (5.26%) rather than EUR 20 (10.53%). This is a product decision, not measured price willingness.

With a EUR 700 contract and EUR 100 deposit, the fee is EUR 28, versus the previous EUR 4. The supplier receives EUR 72 from the deposit and EUR 600 by direct invoice; the buyer still pays EUR 700 in total. At the same disclosed standard-card/VAT-inclusive assumptions, EUR 28 / 1.24 rounded to EUR 22.58 less EUR 1.75 processing leaves EUR 20.83 for operating costs. An assumed EUR 300/month budget then requires 173 retained contracts annually, before refunds, payout fees, variable support and acquisition. This improvement does not by itself prove profitability. Fee policy, deposit coverage and withdrawal handling are specified in ADR 0005.

## Finding

Charging 4% of deposits can fund inexpensive hosting at sufficient volume, but it is a weak sole funding source for maintenance, support and payment operations. Actual operating invoices and annual transaction volume have not been supplied, so the calculations below are scenarios, not measured profitability or forecasts.

The original [business analysis](../Uhishange_arianaluus_2026-10-09.docx), sections 5.1, 5.2 and 9.1, assumes a supplier success fee of 3–5% of the **full service value**. Its example of 500 associations spending EUR 6,000 annually produces EUR 3 million GMV and EUR 120,000 at 4%. Section 13.3 proposes EUR 50–200 deposits as a willingness hypothesis. The original accepted pilot plan instead required **4% of retained deposits**, which the code implemented before ADR 0005. With 500 retained EUR 100 deposits that model produces EUR 2,000 gross fees, sixty times less than the original full-value example.

## Deposit-only baseline implementation evidence

- [constants.ts](../../src/shared/constants.ts): 400 fee basis points.
- Before the upgrade, [domain.ts](../../src/server/domain.ts) rounded each retained deposit fee to the nearest cent at successful deadline finalization; the supplier received the remainder. The buyer's full deposit credit and remaining invoice outside the portal continue unchanged.
- Unsuccessful groups and pre-success withdrawals earn no fee. Supplier cancellation reverses previously allocated fees. Post-success retained withdrawals can generate fees despite having no continuing contract; therefore contract count alone does not fully reconcile fee revenue.
- Before the upgrade, [validation.ts](../../src/server/validation.ts) allowed any positive deposit up to the cheapest tier price, with no minimum fee, minimum commercial deposit or deposit-to-service-value ratio. EUR 1 yielded EUR 0.04; 1–12 cents yielded no fee after rounding. New offers instead require coverage of the contract fee, including the EUR 10 minimum.
- The recorded workflow has EUR 2,100 of service contracts, EUR 300 of deposits and EUR 12 of TEST fees: an effective gross fee of 0.571% of service value.

## Cost assumptions and sources

Prices were checked on 2026-10-10 using provider and tax-authority pages. No provider has been selected or integrated.

| Input                        | Basis                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard EEA card processing | [Stripe Estonia](https://stripe.com/en-ee/pricing): 1.5% + EUR 0.25 per capture. Premium EEA cards are 2.8% + EUR 0.25, so the standard-card scenario is optimistic for business cards.                                                                                                                                                                                                                                             |
| Marketplace payouts          | [Stripe Connect Estonia](https://stripe.com/en-ee/connect/pricing): in the platform-managed pricing model, EUR 2 per monthly active connected account and 0.25% + EUR 0.10 per payout. These additional costs are excluded from the base tables. Another integration can allocate these costs differently.                                                                                                                          |
| Refunds                      | [Stripe support](https://support.stripe.com/questions/understanding-fees-for-refunded-payments): original processing and Connect fees are not returned. The pilot's full customer refunds must therefore be funded alongside these provider costs.                                                                                                                                                                                  |
| VAT sensitivity              | [Estonian Tax and Customs Board](https://www.emta.ee/en/business-client/taxes-and-payment/value-added-tax): standard VAT is 24%. The alternate scenario assumes a VAT-registered portal and a **VAT-inclusive** 4% fee. This is an assumption, not a determination of the portal's tax status.                                                                                                                                      |
| Small-server reference       | [Hetzner price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/): German/Finland CX33 EUR 8.49/month excluding IPv4; [backup billing](https://docs.hetzner.com/cloud/billing/faq/) adds 20% of server price. Database backups, domain, off-site storage, monitoring, email, administration and engineering are additional. This is a reference price, not a deployment capacity test. |

Use EUR 50/month as an illustrative technical operating budget. Use EUR 300/month as a modest total budget: EUR 50 technical services, four hours of maintenance/support at an assumed EUR 50/hour, and EUR 50 administration/reserve. These are explicit planning choices, not quotes; variable support, development recovery, acquisition, disputes, supplier onboarding and PSP payout costs remain excluded. Startup costs and profit are excluded. Avoid counting the same work both as fixed time and per-participation support.

## Per-participation economics

One participation means one association's retained captured deposit in one procurement, not one unique association or one entire group procurement. The base scenario assumes the portal bears capture costs, standard EEA cards, no refunds, and no additional payout/support costs.

| Deposit | Gross 4% fee | Capture cost | Contribution before VAT | Contribution if fee includes 24% VAT |
| ------: | -----------: | -----------: | ----------------------: | -----------------------------------: |
|  EUR 50 |     EUR 2.00 |     EUR 1.00 |                EUR 1.00 |                             EUR 0.61 |
| EUR 100 |     EUR 4.00 |     EUR 1.75 |                EUR 2.25 |                             EUR 1.48 |
| EUR 200 |     EUR 8.00 |     EUR 3.25 |                EUR 4.75 |                             EUR 3.20 |
| EUR 500 |    EUR 20.00 |     EUR 7.75 |               EUR 12.25 |                             EUR 8.38 |

Contribution is available for fixed costs; it is not net profit. Fee and assumed provider costs are rounded to cents per participation. VAT-exclusive fee revenue is rounded to cents per participation in the alternate scenario; invoice aggregation may cause small rounding differences.

## Annual break-even

Divide twelve months of fixed costs by per-participation contribution and round **up**. Snow procurement revenue may arrive once per year while operating expenses continue year-round; a monthly average is not steady monthly cash flow.

| Deposit | EUR 50/month, before VAT | EUR 50/month, inclusive VAT | EUR 300/month, before VAT | EUR 300/month, inclusive VAT |
| ------: | -----------------------: | --------------------------: | ------------------------: | ---------------------------: |
|  EUR 50 |                      600 |                         984 |                     3,600 |                        5,902 |
| EUR 100 |                      267 |                         406 |                     1,600 |                        2,433 |
| EUR 200 |                      127 |                         188 |                       758 |                        1,125 |
| EUR 500 |                       49 |                          72 |                       294 |                          430 |

At 500 retained EUR 100 participations per year, the model generates EUR 2,000 gross fees less EUR 875 capture costs: EUR 1,125 before VAT, or EUR 740 in the inclusive-VAT scenario. That supports only EUR 93.75/month or EUR 61.67/month respectively, before other variable costs.

Refunds lower this further. If 20% of captures are ultimately refunded/cancelled, each retained participation must fund 1/0.8 captures on average. At EUR 100 the expected contribution falls to EUR 1.8125 before VAT or EUR 1.0425 with inclusive VAT. EUR 300/month requires approximately 1,987 or 3,454 retained participations annually, plus payout/support costs. Those are expected-volume thresholds, not a forecast or exact integer batch guarantee.

## Initial recommendation and accepted follow-up

The initial recommendation was to test a supplier success fee on **final service contract value**, with a minimum and explicit VAT/PSP policy. The maintainer subsequently authorized implementing a reasonable service fee. The accepted policy is 4% of final gross contract value with a EUR 10 minimum, as explained above and in ADR 0005. A subscription or sponsoring partner remains an alternative/additional way to fund fixed operating costs.

The supplier's deposit should be selected for commitment/risk management rather than used as the sole revenue lever. Obtain the maintainer's expected annual participations, average contract/deposit, refund rate, payment mix, support minutes and real operating budget before setting final prices. Higher deposits alone could reduce joining and are not a demonstrated solution.

The new implementation defines fee basis, VAT, payer, minimum, timing, forfeiture handling and cancellation refunds in the accepted terms. Fee policies must be frozen in acceptance snapshots and control finalization. The original deposit implementation read the global rate at finalization; ADR 0005 replaces this with stored terms, including the historical feeBasisPoints fallback. Do not retrospectively reprice existing snapshots.

## Reproducibility

[pricing-scenarios.ipynb](pricing-scenarios.ipynb) contains the executed calculations, assumptions and assertions. Python 3 with nbformat, nbclient, ipykernel and nbconvert can rerun it:

```powershell
python -m jupyter nbconvert --execute --to notebook --inplace docs/Business/pricing-scenarios.ipynb
```

The notebook uses local, disclosed scenario inputs and no live business data. Tables are sufficient for this small exact-value comparison; no synthetic performance series or measured usage claims are introduced. The notebook itself does not change application data or payments. The separately authorized application update implements ADR 0005.
