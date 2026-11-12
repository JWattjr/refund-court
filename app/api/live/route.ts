import { snapshot } from "@/lib/server-chain";
export async function GET() {
  try {
    return Response.json(await snapshot(), {
      headers: {
        "Cache-Control": "public, s-maxage=45, stale-while-revalidate=15",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Live reads unavailable" },
      { status: 503 },
    );
  }
}
