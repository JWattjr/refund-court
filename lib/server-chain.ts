import { createClient, decodeLocalnetTransaction } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import {
  TransactionHashVariant,
  type TransactionHash,
} from "genlayer-js/types";
import source from "@/deploy/proof.json";
import {
  transactionState,
  type Proof,
  type Service,
  type Bond,
  type CourtCase,
  type TxView,
} from "./domain";
export const recorded = source as unknown as Proof;
const chain = createClient({
  chain: studionet,
  endpoint: "https://studio.genlayer.com/api",
});
const cache = new Map<string, { at: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function memo<T>(
  key: string,
  fn: () => Promise<T>,
  ttl = 45000,
): Promise<T> {
  const old = cache.get(key);
  if (old && Date.now() - old.at < ttl) return old.value as T;
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const job = fn()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
export async function read<T>(
  contract: string,
  method: string,
  args: unknown[] = [],
): Promise<T> {
  const address = recorded.contracts[contract]?.address;
  if (!address) throw Error("Deployment not recorded yet.");
  return memo(contract + method + JSON.stringify(args), async () => {
    const r = await chain.readContract({
      address: address as `0x${string}`,
      functionName: method,
      args: args as never[],
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
    return (typeof r === "string" && /^[\[{]/.test(r) ? JSON.parse(r) : r) as T;
  });
}
export async function snapshot() {
  const [serviceIds, caseIds] = await Promise.all([
    read<string[]>("ServicePromise", "get_ids", [0, 50]),
    read<string[]>("RefundCourt", "get_ids", [0, 50]),
  ]);
  const services: Service[] = [],
    claimCases: CourtCase[] = [],
    bonds: Record<string, Bond> = {};
  // Bound public RPC load. Cache coalesces concurrent visitor requests.
  for (const key of serviceIds.slice(-20)) {
    services.push(await read<Service>("ServicePromise", "get_service", [key]));
    bonds[key] = await read<Bond>("RefundCourt", "get_bond", [key]);
  }
  for (const key of caseIds.slice(-20))
    claimCases.push(await read<CourtCase>("RefundCourt", "get_case", [key]));
  return { services, claimCases, bonds, readAt: new Date().toISOString() };
}
export async function transaction(hash: string): Promise<TxView> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Invalid transaction hash");
  return memo(
    "tx" + hash,
    async () => {
      const raw = await chain.request({
        method: "eth_getTransactionByHash",
        params: [hash as TransactionHash],
      });
      if (!raw)
        return {
          hash,
          state: "SUBMITTED",
          children: [],
          appealDeadline: null,
          error: null,
        };
      const r = decodeLocalnetTransaction(raw as never) as unknown as Record<
        string,
        unknown
      >;
      const state = transactionState(r);
      let appealDeadline: number | null = null;
      if (state === "ACCEPTED") {
        const window = Number(
          await memo(
            "window",
            () =>
              chain.request({ method: "sim_getFinalityWindowTime" as never }),
            300000,
          ),
        );
        const start = Number(r.timestamp_awaiting_finalization);
        if (
          r.leader_only === false &&
          r.appealed !== true &&
          start > 0 &&
          window > 0
        )
          appealDeadline =
            start +
            Number(r.appeal_processing_time ?? 0) +
            window * 0.8 ** Number(r.appeal_failed ?? 0);
      }
      const leader = (
        r.consensus_data as {
          leader_receipt?: {
            result?: { payload?: { readable?: string } };
            genvm_result?: { stderr?: string };
          }[];
        }
      )?.leader_receipt?.[0];
      return {
        hash,
        state,
        children: (r.triggered_transactions as string[]) ?? [],
        appealDeadline,
        error:
          state === "FINALIZED_ERROR"
            ? (leader?.result?.payload?.readable ??
              leader?.genvm_result?.stderr ??
              "Contract execution failed. Open the receipt for details.")
            : null,
      };
    },
    10000,
  );
}
