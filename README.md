# Refund Court

**Chargebacks for agents.** An agent pays an API with x402. If the seller's signed response breaches a frozen promise, GenLayer validators judge each criterion and the buyer receives a fixed reimbursement from the seller's GEN bond.

[Live app](https://refund-court.vercel.app) · [Public source](https://github.com/JWattjr/refund-court)

This project targets the **Internet Court: Partner Demo Lab** mission, partner **x402**. It is a desktop application. No Portal submission is automated.

## Architecture

```mermaid
sequenceDiagram
    participant Buyer as Buyer agent
    participant API as Signed demo API
    participant Base as x402 facilitator / Base Sepolia
    participant Promise as ServicePromise / GenLayer
    participant Court as RefundCourt / GenLayer
    Buyer->>API: GET weather
    API-->>Buyer: 402 PAYMENT-REQUIRED
    Buyer->>API: PAYMENT-SIGNATURE
    API->>Base: Verify and settle 0.001 USDC
    Base-->>API: Payment transaction hash
    API-->>Buyer: Exact request, response, seller signature
    Note over Promise: Validators compile 2–4 criteria; freeze and hash
    Note over Court: Seller posts GEN bond after owner approval
    Buyer->>Court: Reserve claim; code verifies seller signature and replay guard
    Buyer->>Court: Deposit 1 wei filing fee
    Court->>Base: Validators independently verify canonical USDC transfer
    Note over Court: One narrow judgment per criterion; literal quote
    Court-->>Buyer: NOT_MET: fixed 5 wei reimbursement + filing fee credit
    Buyer->>Court: claim, then verify_claim
    Court-->>Buyer: Finalized native transfer; verified value_credited
```

`ServicePromise` owns the consensus compiler. `RefundCourt` owns deterministic secp256k1 recovery, payment uniqueness, reserved bond capacity, Base RPC confirmation, criterion consensus and native-credit accounting. The application and scripts only capture evidence, broadcast transactions and display chain state. They do not select verdicts.

The x402 USDC payment stays on Base Sepolia. A **fixed, agreed 5 wei GEN demo reimbursement** comes from the seller's separate StudioNet bond. No exchange-rate conversion or USDC reversal is claimed. Each of three seller endpoints has a 20 wei bond; each paid claim has a 1 wei filing fee. The intended contract deposit budget is 63 wei GEN, subject to owner approval.

## Deployment and evidence

Deployed addresses, hashes and exact source digests are in [deploy/proof.json](deploy/proof.json). Canonical Explorer URLs, checked with a browser user agent and `type: CONTRACT`, are in [deploy/link-verification.json](deploy/link-verification.json). Contract evidence has its own entry in the prepared Portal fields; transaction or repository links never replace it.

**The release is incomplete until `npm run verify:proof` passes.** The manifest must prove six finalized live cases: subjective compilation rejection; accepted and bonded promises; a NOT_MET refund with verified native credit; an all-MET seller fee; a failed response injection; and deterministic forgery/replay rejection. The verifier returns a nonzero exit code for missing proof. Tests with mocked RPC or LLM responses are explicitly not live evidence.

## Run locally

Use Node 24 and Python 3.14 with the exact dependencies in package-lock.json and requirements.txt.

```bash
npm ci
python -m pip install -r requirements.txt
npm run typecheck
npm run lint:contracts
npm run test:contract
npm test
npm run dev
```

Open `http://localhost:3140` on desktop. The home page needs no wallet. Recorded proof and live finalized reads are separate controls. Transaction hashes persist in browser storage and are polled after reload. Accepted and finalized execution states remain distinct; the API exposes the current appeal window when available.

The seller API needs `SELLER_PRIVATE_KEY` in an ignored `.env.local` or a server-only Vercel Secret. Use only a dedicated testnet wallet. Never publish the key or prefix it with `NEXT_PUBLIC_`. The original owner explicitly approved export of this generated demo seller key to the named Vercel project; this grants no authority over other keys.

## Buyer agent

The official x402 2.30.0 client handles the 402 challenge and EIP-3009 authorization. The captured artifact stores the exact bytes signed by the seller after the facilitator returns a confirmed payment hash.

```bash
npm run agent -- broken
python scripts/release.py file broken
npm run agent -- honest
python scripts/release.py file honest
npm run agent -- injection
python scripts/release.py file injection
python scripts/release.py reject
```

The scripts use dedicated local demo accounts under ignored `.secrets/`. A payment intent is written before sending. An unresolved intent blocks automatic repayment; reconcile chain activity rather than deleting it and blindly paying again. Evidence is public data; wallet keys are not. Filing requires at least three Base confirmations. Court deposits fail closed until an explicit owner-approved cumulative budget is recorded.

## Failure and settlement behavior

- Any UNCLEAR verdict or unavailable payment evidence: VOID; filing fee returned as credit. Any NOT_MET with no UNCLEAR: buyer reimbursement plus fee credit. All MET: seller receives the filing fee.
- Expired reserved/funded/judged cases: release seller capacity and return any filing fee. Invalid/stale payable intents: credit the sender instead of stranding incoming value.
- Seller withdrawals: 24-hour cooldown, no open claims. Receipts signed before the cooldown began remain claimable during it.
- Pulls reserve credit, emit only on finalization, and must be reconciled using matching finalized parent/child receipts. A timer alone never restores a possibly paid pull. `verify_claim` restores credit only for a finalized native failure. Permissionless receipt reconciliation is the timeout recovery path.

The pure Python recovery code enforces a valid curve point, ECDSA scalar bounds, recovery parity and low-s signatures. Validators independently confirm payment token, amount, payer and recipient. Responses are untrusted data, never grading instructions. Leader quotations must occur literally in the signed response; validators compare verdicts without requiring the same quote choice.

## Guides

- [Full tutorial](docs/TUTORIAL.md)
- [45-second demo video script](docs/DEMO.md)
- [Authority boundary](docs/ARCHITECTURE.md)
- [Prepared Portal fields](docs/submission/portal-fields.json)

Official references: [Internet Court skill](https://internetcourt.org/skill.md), [x402 sellers](https://docs.x402.org/getting-started/quickstart-for-sellers), [x402 buyers](https://docs.x402.org/getting-started/quickstart-for-buyers), [testnet facilitator](https://docs.x402.org/core-concepts/facilitator). Exact SDK methods were checked against installed type declarations. The runner stays pinned to the mission-requested hash.
