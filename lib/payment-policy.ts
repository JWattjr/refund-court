import type { PaymentRequirements } from "@x402/core/types";
export function permittedPayments(
  version: number,
  requirements: PaymentRequirements[],
  seller: string,
): PaymentRequirements[] {
  return version === 2
    ? requirements.filter(
        (r) =>
          r.scheme === "exact" &&
          r.network === "eip155:84532" &&
          r.asset.toLowerCase() ===
            "0x036cbd53842c5426634e7929541ec2318f3dcf7e" &&
          r.payTo.toLowerCase() === seller.toLowerCase() &&
          r.amount === "1000" &&
          r.maxTimeoutSeconds > 0 &&
          r.maxTimeoutSeconds <= 300,
      )
    : [];
}
