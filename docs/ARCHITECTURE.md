# Authority boundary

The API and buyer own x402 payment, byte-exact request/response capture and seller signatures. The frontend presents state and broadcasts user-approved transactions. Neither decides a claim.

ServicePromise validators compile the promise into two to four observable criteria. Accepted criteria, endpoint, seller address, price and fixed GEN reimbursement are frozen under a SHA-256 hash. RefundCourt reads this immutable record, holds the bond, prevents payment replay, recovers the seller from the response signature deterministically, verifies Base Sepolia payment logs, and judges each criterion independently. Validators independently derive verdicts and require the leader's quotes to be literal substrings, without matching quote selection.

Native payouts are reserved before emission, emitted on finalization, then checked against finalized parent and child receipts in verify_claim. A pending emission is never refunded merely because a timer expires; that could pay twice. After its deadline anyone can reconcile it using authenticated chain receipts, restoring credit only for a finalized failed native transfer. Reserved cases and funding intents expire into recoverable credits.

Base Sepolia USDC and StudioNet GEN are separate test assets. The fixed wei reimbursement is an explicitly agreed demo schedule, not an exchange-rate oracle or a reversal of the USDC payment. Payment proof requires the canonical USDC transfer event, buyer, seller, amount, successful receipt and confirmed inclusion.
