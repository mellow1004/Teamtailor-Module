import { NextResponse } from "next/server";
import { getJobs } from "@/lib/teamtailor";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await getJobs();
    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Kunde inte hämta jobb" },
      { status: 500 }
    );
  }
}
