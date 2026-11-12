import type { Envelope } from "./domain";
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export async function walletAccount() {
  const p = window.ethereum;
  if (!p)
    throw Error(
      "Install MetaMask or a compatible wallet. Proof is readable without connecting.",
    );
  const accounts = (await p.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw Error("Choose an account in your wallet.");
  return { p, account: accounts[0].toLowerCase() as `0x${string}` };
}
async function switchChain(p: Provider, id: number) {
  const chainId = "0x" + id.toString(16);
  if (Number(await p.request({ method: "eth_chainId" })) === id) return;
  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await p.request({
      method: "wallet_addEthereumChain",
      params: [
        id === 61999
          ? {
              chainId,
              chainName: "GenLayer StudioNet",
              nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
              rpcUrls: ["https://studio.genlayer.com/api"],
              blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
            }
          : {
              chainId,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            },
      ],
    });
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
  if (Number(await p.request({ method: "eth_chainId" })) !== id)
    throw Error("Select the required network in your wallet.");
}
export async function write(
  address: string,
  functionName: string,
  args: unknown[],
  value = 0n,
  onSubmitted?: (hash: string) => void,
) {
  const { p, account } = await walletAccount();
  await switchChain(p, 61999);
  const [{ createClient }, { studionet }] = await Promise.all([
    import("genlayer-js"),
    import("genlayer-js/chains"),
  ]);
  const provider: Provider = {
    request: async (request) => {
      if (request.method !== "eth_sendTransaction") return p.request(request);
      const tx = request.params?.[0] as Record<string, unknown>;
      const hash = await p.request({
        ...request,
        params: [
          {
            ...tx,
            chainId: "0xf22f",
            type: "0x0",
            gasPrice: "0x0",
            value: tx.value ?? "0x0",
          },
        ],
      });
      if (typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash))
        onSubmitted?.(hash);
      return hash;
    },
  };
  const client = createClient({ chain: studionet, account, provider });
  const hash = await client.writeContract({
    address: address as `0x${string}`,
    functionName,
    args: args as never[],
    value,
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw Error(
      "Wallet returned no transaction hash. Check its activity before retrying.",
    );
  return hash;
}
export async function buy(
  mode: string,
  city: string,
  nonce: string,
): Promise<Envelope> {
  const { p, account } = await walletAccount();
  await switchChain(p, 84532);
  const [{ x402Client }, { wrapFetchWithPayment }, { ExactEvmScheme }] =
    await Promise.all([
      import("@x402/core/client"),
      import("@x402/fetch"),
      import("@x402/evm/exact/client"),
    ]);
  const client = new x402Client();
  client.register(
    "eip155:84532",
    new ExactEvmScheme({
      address: account,
      signTypedData: async (data) =>
        p.request({
          method: "eth_signTypedData_v4",
          params: [account, JSON.stringify(data)],
        }) as Promise<`0x${string}`>,
    }),
  );
  const paidFetch = wrapFetchWithPayment(fetch, client);
  const response = await paidFetch(
    `/api/weather/${mode}?city=${encodeURIComponent(city)}&nonce=${encodeURIComponent(nonce)}`,
  );
  const body = await response.json();
  if (!response.ok)
    throw Error(
      body.error ?? "Payment failed. Check wallet activity before retrying.",
    );
  if (!/^0x[0-9a-fA-F]{64}$/.test(body.payment_hash) || !body.signature)
    throw Error(
      "Payment returned no signed evidence. Reconcile before retrying.",
    );
  return body as Envelope;
}
