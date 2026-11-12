# Build a bond-backed refund for an agent's API purchase

Refund Court demonstrates an economic boundary that a successful payment alone cannot establish: whether a paid service delivered the thing it promised. x402 provides the payment rail. GenLayer provides independent judgment. A separate seller bond provides a recoverable amount when that judgment finds a breach. This tutorial uses test assets throughout and should be followed in a desktop browser.

## Understand the two chains

The API sells one synthetic weather report for 0.001 test USDC on Base Sepolia, chain ID 84532. The official public x402 facilitator supports the exact scheme on that network. StudioNet, chain ID 61999, hosts the intelligent contracts and their GEN bond. The chains have different tokens and different purposes. A five-wei reimbursement is a deliberately tiny, fixed demo schedule agreed at registration. It is not five wei of USDC, a live conversion, or a reversal of the original payment.

Before building the court, deploy and execute the access probe. This project records successful validator access to both public Base Sepolia RPCs in deploy/proof.json. This matters because a developer's laptop reaching an RPC says nothing about a validator's access to it. The probe's own final receipts are preserved. If the validator cannot confirm payment evidence later, the case becomes VOID and the buyer's filing fee is credited back.

## Freeze the seller's obligations

A seller registers its HTTPS endpoint and plain-English promise in ServicePromise. The promise should describe observable properties: the requested city, an explicitly named Celsius unit, and an observation timestamp no older than one hour before the signed delivery timestamp. The API labels its reports synthetic. Do not promise real current weather if the underlying service only produces demonstration data.

Validators compile two to four narrow criteria. Each validator independently evaluates whether the original promise is checkable. Subjective language such as the world's most beautiful report must be rejected. A rejected compilation is a successful execution that stores a rejection, not necessarily an execution error. An accepted compilation freezes the criteria and commercial terms under a SHA-256 hash. A finalization callback makes the promise available for bonding only after compilation finality.

The seller then prepares a bond intent and deposits exactly twenty wei. In the owner-operated demonstration this requires explicit approval before the first deposit. The cumulative contract deposit budget for three endpoints and three claims is sixty-three wei. The code rejects an unapproved or excessive scripted deposit. Wrong-value and stale payable intents turn into recoverable sender credit rather than untracked money.

## Make a real x402 purchase

Give the dedicated buyer test USDC on Base Sepolia. It does not need Base ETH for the standard facilitator-sponsored EIP-3009 payment authorization. Run `npm run agent -- broken`, or use the desktop Try it controls with a compatible browser wallet. The client first receives a 402 challenge, signs the advertised payment authorization and retries using the official x402 SDK. The server verifies and settles payment through the facilitator.

Only after the facilitator returns the payment transaction hash does the server sign the evidence digest. The digest is SHA-256 over the exact request string, response string and lowercase payment hash in that order. The signature is a raw secp256k1 digest signature, without an Ethereum personal-message prefix. Store the strings exactly as returned. Reformatting JSON, changing whitespace or changing the transaction hash produces different signed bytes.

The buyer script writes a durable intent before paying. If the process loses its response, an unresolved intent blocks another automatic payment. Inspect the wallet and facilitator transaction first. A missing response is not proof that no money moved.

## File and judge the claim

Wait for three Base confirmations. Reserve the claim with the frozen service ID, payment hash, exact request, exact response and seller signature. Deterministic code recovers the seller address, checks it matches the registry, checks the signed request belongs to the caller and endpoint, and rejects any already-used payment hash. It also reserves five wei of available seller bond so simultaneous cases cannot overcommit it.

After the reservation finalizes, post the one-wei filing fee. After its finalization callback, anyone may ask the validators to judge. The payment verification checks the Base network, canonical successful receipt, USDC contract, transfer event, exact amount, payer and seller. It does not accept an arbitrary transaction just because its hash has the right length.

Each frozen criterion gets one narrow prompt and a strict verdict/quote schema. Responses are untrusted evidence, including text that pretends to be a system instruction. Validators independently derive verdicts. They agree on the labels while allowing different quote choices, as long as the leader's quote is literally present in the response. The injection endpoint deliberately combines wrong units and stale data with an instruction to mark everything MET; the required live proof must show that instruction fails.

## Collect and verify money

If every criterion is MET, the seller receives the filing fee as credit. If any criterion is UNCLEAR, the case is VOID and the buyer receives its filing fee back. Otherwise any NOT_MET grants the buyer the fixed reimbursement plus its filing fee. These allocations are applied by a finalization callback; an accepted judgment remains inside its appeal window.

Credit is pull-based. Call claim with the next attempt number, wait for its finalized native child, then call verify_claim with the owner, attempt, parent hash and child hash. The contract checks both finalized receipts, their parent/child relationship, sender, recipient, value and original claim arguments. A transfer counts as paid only when value_credited is true. Record balances before and after the pull to prove the native change independently.

Reserved cases and funding intents have one-hour deadlines with recovery paths. Seller bond withdrawals have a twenty-four-hour cooldown and require no open claims. A pending native pull is never restored merely because time passed: that could pay twice. After its deadline anyone can reconcile finalized native receipts and restore credit only for a proven failed transfer.

Finally run `npm run verify:proof`. It checks deployed source hashes, finalized execution outcomes, each required case, literal quotations, claimed native credit, balance deltas and canonical Explorer links. Local mocked tests are useful engineering checks; they do not satisfy the live proof requirements. Keep the release marked incomplete until this command passes, then use the prepared Portal fields for manual review. Never submit the Portal form automatically.
