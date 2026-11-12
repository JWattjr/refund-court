import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
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
  // Official core APIs implement this JSON-only API route. No wallet/paywall UI
  // is loaded into the resource server or advertised to agent clients.
  await server.initialize();
  const requirements = await server.buildPaymentRequirements({
    scheme: "exact",
    price: "$0.001",
    network: "eip155:84532",
    payTo: seller.address,
    maxTimeoutSeconds: 300,
  });
  const challenge = async (error = "Payment required") => {
    const required = await server.createPaymentRequiredResponse(
      requirements,
      {
        url: request.url,
        description:
          "Signed demo weather; bond-backed fixed 5 wei GEN reimbursement",
        mimeType: "application/json",
      },
      error,
    );
    return NextResponse.json(
      { error },
      {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(required),
          "Cache-Control": "private, no-store",
        },
      },
    );
  };
  const header = request.headers.get("payment-signature");
  if (!header) return challenge();
  if (header.length > 8000)
    return NextResponse.json(
      { error: "Payment header is too large" },
      { status: 400 },
    );
  let payload;
  try {
    payload = decodePaymentSignatureHeader(header);
  } catch {
    return challenge("Malformed x402 payment");
  }
  if (payload.x402Version !== 2) return challenge("x402 version 2 is required");
  const matched = server.findMatchingRequirements(requirements, payload);
  if (!matched)
    return challenge(
      "Payment does not match this seller, token, network or price",
    );
  if (server.getPaymentFlow(payload, matched) !== "authorization")
    return challenge("This endpoint requires an EIP-3009 authorization flow");
  const authorization = (
    payload.payload as { authorization?: { from?: string } }
  ).authorization;
  if (!authorization?.from || !/^0x[0-9a-fA-F]{40}$/.test(authorization.from))
    return challenge("An exact EIP-3009 buyer authorization is required");
  const verified = await server.verifyPayment(payload, matched);
  if (!verified.isValid)
    return challenge(verified.invalidReason ?? "Invalid payment");
  const deliveredAt = Math.floor(Date.now() / 1000);
  const content = {
    request: JSON.stringify({
      buyer: authorization.from.toLowerCase(),
      city,
      endpoint: request.nextUrl.origin + path,
      delivered_at: deliveredAt,
      nonce,
    }),
    response: weatherBody(mode, city, deliveredAt),
  };
  const payment = await server.settlePayment(payload, matched);
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
      {
        status: 502,
        headers: {
          "PAYMENT-RESPONSE": encodePaymentResponseHeader(payment),
          "Cache-Control": "private, no-store",
        },
      },
    );
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
  const headers = new Headers({
    "PAYMENT-RESPONSE": encodePaymentResponseHeader(payment),
  });
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(envelope, { headers });
}
