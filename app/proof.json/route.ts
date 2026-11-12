import proof from "@/deploy/proof.json";
export function GET() {
  return Response.json(proof, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
