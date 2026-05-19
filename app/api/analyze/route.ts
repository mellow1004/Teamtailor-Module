import { NextRequest, NextResponse } from "next/server";
import { getCandidatesForJob } from "@/lib/teamtailor";
import { processCandidates } from "@/lib/claude";
import { parseLimit } from "@/lib/parseLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { jobId, instruction } = await req.json();
    if (!jobId || !instruction) {
      return NextResponse.json(
        { error: "jobId och instruction krävs" },
        { status: 400 }
      );
    }

    const allCandidates = await getCandidatesForJob(jobId);
    const limit = parseLimit(instruction);
    const candidates =
      limit && limit > 0 ? allCandidates.slice(0, limit) : allCandidates;

    const decisions = await processCandidates(candidates, instruction);

    const merged = candidates.map((c) => {
      const d = decisions.find((x) => x.applicationId === c.applicationId);
      return {
        ...c,
        decision: d?.decision || "maybe",
        reason: d?.reason || "Ingen motivering",
        score: d?.score ?? 5,
      };
    });

    return NextResponse.json({
      results: merged,
      total: allCandidates.length,
      analyzed: candidates.length,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Analys misslyckades" },
      { status: 500 }
    );
  }
}
