import { NextRequest, NextResponse } from "next/server";
import { getCandidatesForJob } from "@/lib/teamtailor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId saknas" }, { status: 400 });
    }
    const candidates = await getCandidatesForJob(jobId);
    return NextResponse.json({ candidates });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Kunde inte hämta kandidater" },
      { status: 500 }
    );
  }
}
