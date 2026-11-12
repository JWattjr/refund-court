import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentSignatureHeader,
  decodePaymentResponseHeader,
} from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { privateKeyToAccount } from "viem/accounts";
import type { Envelope } from "./domain";
import { weatherBody, type Mode } from "./weather-mode";
export async function paidWeather(request: NextRequest, mode: Mode) {
  const key = process.env.SELLER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    return NextResponse.json(
      { error: "Seller signing is not configured; no payment was requested." },
      { status: 503 },
    );
  const seller = privateKeyToAccount(key as `0x${string}`);
  const city = request.nextUrl.searchParams.get("city") ?? "Lagos";
  const nonce = request.nextUrl.searchParams.get("nonce") ?? randomUUID();
  if (
    !/^[\p{L} .'-]{1,80}$/u.test(city) ||
    !/^[a-zA-Z0-9-]{8,100}$/.test(nonce)
  )
    return NextResponse.json(
      { error: "Use a city name and an 8–100 character nonce." },
      { status: 400 },
    );
  const server = new x402ResourceServer(
    new HTTPFacilitatorClient({
      url: "https://x402.org/facilitator",
      timeoutMs: 30000,
    }),
  ).register("eip155:84532", new ExactEvmScheme());
  const path = "/api/weather/" + mode;
  const protectedHandler = withX402<unknown>(
    async (req: NextRequest) => {
      const payload = decodePaymentSignatureHeader(
        req.headers.get("payment-signature") ?? "",
      );
      const authorization = (
        payload.payload as { authorization?: { from?: string } }
      ).authorization;
      if (
        !authorization?.from ||
        !/^0x[0-9a-fA-F]{40}$/.test(authorization.from)
      )
        return NextResponse.json(
          { error: "An exact EIP-3009 buyer authorization is required." },
          { status: 400 },
        );
      const deliveredAt = Math.floor(Date.now() / 1000);
      const endpoint = req.nextUrl.origin + path;
      return NextResponse.json({
        request: JSON.stringify({
          buyer: authorization.from.toLowerCase(),
          city,
          endpoint,
          delivered_at: deliveredAt,
          nonce,
        }),
        response: weatherBody(mode, city, deliveredAt),
      });
    },
    {
      [path]: {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",
            payTo: seller.address,
          },
        ],
        description:
          "Signed demo weather; bond-backed fixed 5 wei GEN reimbursement",
        mimeType: "application/json",
      },
    },
    server,
  );
  const settled = await protectedHandler(request);
  if (!settled.ok) return settled;
  const header = settled.headers.get("payment-response");
  if (!header)
    return NextResponse.json(
      {
        error:
          "No settlement receipt. Do not retry a possibly paid request until its payment is reconciled.",
      },
      { status: 502 },
    );
  const payment = decodePaymentResponseHeader(header);
  if (
    !payment.success ||
    !/^0x[0-9a-fA-F]{64}$/.test(payment.transaction) ||
    payment.network !== "eip155:84532"
  )
    return NextResponse.json(
      {
        error:
          "Settlement is not confirmed. Reconcile its payment hash before retrying.",
        settlement: payment,
      },
      { status: 502, headers: settled.headers },
    );
  const content = (await settled.json()) as {
    request: string;
    response: string;
  };
  const hash = payment.transaction.toLowerCase() as `0x${string}`;
  const digest = createHash("sha256")
    .update(content.request + content.response + hash)
    .digest("hex");
  const signature = await seller.sign({ hash: `0x${digest}` });
  const envelope: Envelope = {
    ...content,
    payment_hash: hash,
    signature,
    evidence_sha256: digest,
  };
  const headers = new Headers(settled.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(envelope, { headers });
}
