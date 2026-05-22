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
    const { jobId, instruction } = await req.json();
    if (!jobId || !instruction) {
      return NextResponse.json(
        { error: "jobId och instruction krävs" },
        { status: 400 }
      );
    }

    const [allCandidates, jobDescription] = await Promise.all([
      getCandidatesForJob(jobId),
      fetchJobDescription(jobId),
    ]);

    const limit = parseLimit(instruction);
    const candidates =
      limit && limit > 0 ? allCandidates.slice(0, limit) : allCandidates;

    const decisions = await processCandidates(candidates, instruction, jobDescription);

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
