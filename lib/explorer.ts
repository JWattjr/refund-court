const GENLAYER = "https://explorer-studio.genlayer.com";
export function explorer(kind: "address" | "tx", value: string): string {
  if (
    !new RegExp(
      kind === "address" ? "^0x[0-9a-fA-F]{40}$" : "^0x[0-9a-fA-F]{64}$",
    ).test(value)
  )
    throw Error("Invalid GenLayer Explorer identifier");
  return `${GENLAYER}/${kind}/${value}`;
}
export function explorerApi(kind: "address" | "tx", value: string): string {
  explorer(kind, value);
  return `${GENLAYER}/api/${kind === "address" ? "address" : "transactions"}/${value}`;
}
export function basePayment(hash: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error("Invalid Base transaction");
  return `https://sepolia.basescan.org/tx/${hash}`;
}
