# Verified live proof

[App](https://refund-court.vercel.app) · [Public source](https://github.com/JWattjr/refund-court)

Verified at 2026-11-12T20:47:43.820325+00:00. All six required live cases have finalized. Native refunds are credited and reconciled on chain.

| Required case | Result | Receipts |
| --- | --- | --- |
| Subjective promise | REJECTED | [Compile](https://explorer-studio.genlayer.com/tx/0x1e4dfae43e90c7aa12099b958a35d0ba4e5db9b7089d98fd1333b37e655f4991) |
| Observable promises and bonds | Three FROZEN promises, three 20 wei deposits | [service-2 bond](https://explorer-studio.genlayer.com/tx/0x63f7b1c0320a271056746699a74c11dd313bf434c2c41592aa0223befd4073b3), [service-3 bond](https://explorer-studio.genlayer.com/tx/0x3f4ef6324c729fcb209831432db427b4f318238e8fba1bfb075d94f5b6567cf5), [service-4 bond](https://explorer-studio.genlayer.com/tx/0x9d677094d0ecb84ba260bd04d67b8a92aefad9d8982768f68b141aefb33f57c0) |
| Broken response | NOT_MET → REFUND | [Judgment](https://explorer-studio.genlayer.com/tx/0xe29d8edad05ac3b63670c3ed741444618f9ad4c9f5354c7ce29a27db1607fac3), [native credit](https://explorer-studio.genlayer.com/tx/0x7b19789a29bea6c97823a9df9afd0d33808278b4d5b4535d74dcab5715e5ed14), [verify_claim](https://explorer-studio.genlayer.com/tx/0xd63a279660d0f3a89181c8163a8e246f46867d1f99831982a4009f83410134a9) |
| Honest response | All MET → seller fee | [Judgment](https://explorer-studio.genlayer.com/tx/0xdb710293b992e2b6bc2946c91c6fdd67a4b8d7ff97c192f4bb5600c871eb9182), [seller native credit](https://explorer-studio.genlayer.com/tx/0xd7a02d99600ad7d20eb2b8c3fe8b198c001353b9ed323bfb9353420cecf6bf0b), [verify_claim](https://explorer-studio.genlayer.com/tx/0x8261d1e06c53f7171f098539c8d025b65b79e2da15db398c8fa976c933497c44) |
| Response injection | Instruction ignored; NOT_MET → REFUND | [Judgment](https://explorer-studio.genlayer.com/tx/0x3be71009573184a286f21f6b7f6faac6d06e89707310b59912d949caf3e4bc14), [aggregate native credit](https://explorer-studio.genlayer.com/tx/0x7b19789a29bea6c97823a9df9afd0d33808278b4d5b4535d74dcab5715e5ed14) |
| Replay and forgery | Both FINALIZED execution errors by code | [Replay](https://explorer-studio.genlayer.com/tx/0x28bd8fc5cc8a778b024a4501f9f5c981f1996d08f4dd567d057eb64fcd86108a), [forgery](https://explorer-studio.genlayer.com/tx/0x421b07f30ef9eb9782480e27ead52c2ef3c4224bc49a952c825889e27bc54e03) |

The buyer received one aggregate **12 wei** transfer: **10 wei of reimbursements plus 2 wei of returned filing fees**. The seller received **1 wei** for the honest case. Both native child receipts report `value_credited: true`, and both reserved pulls read `PAID` after `verify_claim`.

Native balances: buyer **0 → 12 wei**, seller **0 → 1 wei**, court **63 → 50 wei**. The remaining 50 wei backs the three active seller bonds. No new deposits were made to manufacture the payout proof.

**Total contract deposits: 63 wei GEN (0.000000000000000063 GEN)**, within the owner-approved limit. Three required x402 payments spent **0.003 test USDC**; one separately approved compatibility check spent **0.001 test USDC**. Funding transfers are recorded separately from contract deposits to avoid counting the same value twice.

## Contract evidence

- GenLayer Explorer Contract · ServicePromise: [0x513f507781d8C9e2CD4DD6c5FBFcd9e660894939](https://explorer-studio.genlayer.com/address/0x513f507781d8C9e2CD4DD6c5FBFcd9e660894939)
- GenLayer Explorer Contract · RefundCourt: [0xE02364441641a84e8c1545C50f3E259Ff8e6b80d](https://explorer-studio.genlayer.com/address/0xE02364441641a84e8c1545C50f3E259Ff8e6b80d)
- GenLayer Explorer Contract · Base payment probe: [0xD419715e0a10DE844996d58a85deB0D4B8a4AE85](https://explorer-studio.genlayer.com/address/0xD419715e0a10DE844996d58a85deB0D4B8a4AE85)

Every address link was verified as `CONTRACT` with the Studio Explorer API and opened on its matching contract page. Transaction links were verified by hash through `/api/transactions`, with a browser user agent.

See [full manifest](../deploy/proof.json), [machine-readable case receipts](../deploy/case-receipts.json), [native balance proof](../deploy/native-balance-proof.json), [verifier report](../deploy/proof-verification.json) and [link verification](../deploy/link-verification.json). The Portal draft is prepared but **not submitted**.
