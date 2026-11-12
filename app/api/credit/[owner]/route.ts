import { read } from "@/lib/server-chain";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ owner: string }> },
) {
  const { owner } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner))
    return Response.json({ error: "Invalid wallet address" }, { status: 400 });
  try {
    return Response.json(await read("RefundCourt", "get_credit", [owner]));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Credit read unavailable" },
      { status: 503 },
    );
  }
}
