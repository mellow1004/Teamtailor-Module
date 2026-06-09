import { NextRequest, NextResponse } from "next/server";
import { getCandidatesForJob } from "@/lib/teamtailor";
import { processCandidates } from "@/lib/claude";
import { parseLimit } from "@/lib/parseLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function fetchJobDescription(jobId: string): Promise<string> {
  const apiKey = process.env.TEAMTAILOR_API_KEY;
  if (!apiKey) return "";
  const res = await fetch(`https://api.teamtailor.com/v1/jobs/${jobId}`, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      "X-Api-Version": "20180828",
      Accept: "application/vnd.api+json",
    },
    cache: "no-store",
  });
  if (!res.ok) return "";
  const data = await res.json();
  const attrs = data?.data?.attributes || {};
  const title: string = attrs.title || "";
  const pitch: string = attrs.pitch || "";
  const bodyHtml: string = attrs.body || "";
  const bodyText = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return [
    title && `Titel: ${title}`,
    pitch && `Sammanfattning: ${pitch}`,
    bodyText && `Beskrivning: ${bodyText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const { jobId, instruction, cachedIds, selectedStageIds } = await req.json();
    if (!jobId || !instruction) {
      return NextResponse.json(
        { error: "jobId och instruction krävs" },
        { status: 400 }
      );
    }

    const cachedSet = new Set<string>(
      Array.isArray(cachedIds) ? cachedIds.map(String) : []
    );
    const stageIds = Array.isArray(selectedStageIds)
      ? selectedStageIds.map(String)
      : [];

    const [allCandidates, jobDescription] = await Promise.all([
      getCandidatesForJob(jobId, stageIds),
      fetchJobDescription(jobId),
    ]);

    const candidates = allCandidates.filter((c) => !cachedSet.has(c.applicationId));

    console.log("[analyze] skickar till Claude", {
      jobId,
      count: candidates.length,
      names: candidates.map((c) => c.fullName),
    });

    const decisions = await processCandidates(candidates, instruction, jobDescription);

    const merged = candidates.map((c) => {
      const d = decisions.find((x) => x.applicationId === c.applicationId);
      return {
        ...c,
        decision: d?.decision || "maybe",
        reason: d?.reason || "Ingen motivering",
        score: d?.score ?? 5,
        flags: d?.flags ?? [],
      };
    });

    const limit = parseLimit(instruction);
    const eligible = merged
      .filter((m) => m.decision === "approve" || m.decision === "maybe")
      .sort((a, b) => b.score - a.score);
    const finalResults = limit && limit > 0 ? eligible.slice(0, limit) : eligible;

    const screeningRejects = merged.filter((m) => {
      if (m.decision !== "reject") return false;
      const reason = (m.reason || "").trim().toLowerCase();
      return reason.startsWith("screeningfråga:");
    }).length;

    return NextResponse.json({
      results: finalResults,
      allCandidates: merged,
      total: allCandidates.length,
      analyzed: candidates.length,
      skipped: allCandidates.length - candidates.length,
      returned: finalResults.length,
      screeningRejects,
      limit,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Analys misslyckades" },
      { status: 500 }
    );
  }
}
