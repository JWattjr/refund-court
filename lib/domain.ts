export type TxState =
  | "SUBMITTED"
  | "PENDING"
  | "ACCEPTED"
  | "FINALIZED_SUCCESS"
  | "FINALIZED_ERROR";
export type TxView = {
  hash: string;
  state: TxState;
  children: string[];
  appealDeadline: number | null;
  error: string | null;
};
export type Service = {
  id: string;
  seller: string;
  endpoint: string;
  promise: string;
  criteria: string[];
  reason: string;
  status: string;
  hash: string;
  refund_wei: string;
  price_units: string;
};
export type Bond = {
  balance?: string;
  locked?: string;
  status?: string;
  open?: number;
  deadline?: number;
  withdraw_after?: number;
};
export type Criterion = {
  criterion: string;
  verdict: "MET" | "NOT_MET" | "UNCLEAR";
  quote: string;
};
export type CourtCase = {
  id: string;
  service_id: string;
  promise_hash: string;
  buyer: string;
  payment_hash: string;
  request: string;
  response: string;
  signature: string;
  evidence_sha256: string;
  status: string;
  deadline: number;
  verdicts: Criterion[];
  payment: Record<string, unknown>;
  refund_wei: string;
  fee_wei: string;
  reason: string;
};
export type Credit = {
  available_wei: string;
  pull: {
    status?: string;
    amount?: string;
    attempt?: number;
    parent_hash?: string;
    child_hash?: string;
    deadline?: number;
  };
};
export type Proof = {
  network: string;
  chainId: number;
  releaseStatus: string;
  website?: string;
  github?: string;
  recordedAt?: string;
  contracts: Record<
    string,
    { address: string; source: string; sha256: string }
  >;
  transactions: Record<string, string>;
  services?: Service[];
  bonds?: Record<string, Bond>;
  claimCases?: CourtCase[];
  credits?: Record<string, Credit>;
  cases: Record<string, unknown>;
  deposits: Record<string, number>;
  demoWallets?: string[];
  probeContract?: string;
};
export type Envelope = {
  request: string;
  response: string;
  signature: `0x${string}`;
  payment_hash: `0x${string}`;
  evidence_sha256: string;
};
export function transactionState(r: Record<string, unknown>): TxState {
  const status = String(r.status_name ?? r.status ?? "SUBMITTED");
  if (status === "FINALIZED" || status === "7") {
    const consensus = r.consensus_data as
      | { leader_receipt?: { execution_result?: string }[] }
      | undefined;
    const execution = String(
      r.txExecutionResultName ??
        consensus?.leader_receipt?.[0]?.execution_result ??
        "",
    );
    return (execution === "SUCCESS" ||
      execution === "FINISHED_WITH_RETURN" ||
      (r.value_credited === true &&
        String(r.type) === "0" &&
        !r.consensus_data)) &&
      !["MAJORITY_DISAGREE", "DISAGREE"].includes(String(r.result_name))
      ? "FINALIZED_SUCCESS"
      : "FINALIZED_ERROR";
  }
  return status === "ACCEPTED" || status === "6"
    ? "ACCEPTED"
    : status === "SUBMITTED"
      ? "SUBMITTED"
      : "PENDING";
}
export const short = (s: string) =>
  s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
export function captureTime(value: string): string {
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}
