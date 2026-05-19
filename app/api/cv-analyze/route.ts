import { NextRequest, NextResponse } from "next/server";
import { getCVForCandidate } from "@/lib/teamtailor";
import { analyzeCv } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Input = { candidateId: string; applicationId: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const candidates: Input[] = Array.isArray(body?.candidates) ? body.candidates : [];
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Listan candidates krävs (med candidateId och applicationId)" },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      candidates.map(async ({ candidateId, applicationId }) => {
        try {
          const cvText = await getCVForCandidate(candidateId);
          const analysis = await analyzeCv(cvText);
          return {
            candidateId,
            applicationId,
            status: "ok" as const,
            ...analysis,
          };
        } catch (err: any) {
          return {
            candidateId,
            applicationId,
            status: "unavailable" as const,
            error: err?.message || "CV ej tillgängligt",
          };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "CV-analys misslyckades" },
      { status: 500 }
    );
  }
}
