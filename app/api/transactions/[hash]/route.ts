import { transaction } from "@/lib/server-chain";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash } = await params;
    return Response.json(await transaction(hash));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Receipt unavailable" },
      { status: 503 },
    );
  }
}
