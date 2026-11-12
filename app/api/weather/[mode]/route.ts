import { NextRequest, NextResponse } from "next/server";
import { paidWeather } from "@/lib/paid-weather";
export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mode: string }> },
) {
  const { mode } = await params;
  if (mode !== "honest" && mode !== "broken" && mode !== "injection")
    return NextResponse.json(
      { error: "Unknown demo endpoint" },
      { status: 404 },
    );
  try {
    return await paidWeather(request, mode);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Payment service unavailable. Reconcile any submitted payment before retrying.",
      },
      { status: 503 },
    );
  }
}
