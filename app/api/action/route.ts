import { NextRequest, NextResponse } from "next/server";
import {
  moveCandidate,
  rejectCandidate,
  addNote,
  getStagesForJob,
} from "@/lib/teamtailor";

export const dynamic = "force-dynamic";

async function resolveJobIdFromApplication(applicationId: string): Promise<string> {
  const apiKey = process.env.TEAMTAILOR_API_KEY;
  if (!apiKey) throw new Error("TEAMTAILOR_API_KEY saknas i .env.local");
  const res = await fetch(
    `https://api.teamtailor.com/v1/job-applications/${applicationId}?include=job`,
    {
      headers: {
        Authorization: `Token token=${apiKey}`,
        "X-Api-Version": "20180828",
        Accept: "application/vnd.api+json",
      },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`Kunde inte hämta ansökan (HTTP ${res.status})`);
  const data = await res.json();
  let jobId: string | undefined = data?.data?.relationships?.job?.data?.id;
  if (!jobId) {
    const included: any[] = Array.isArray(data?.included) ? data.included : [];
    jobId = included.find((i) => i.type === "jobs")?.id;
  }
  if (!jobId) throw new Error("Hittade inget jobb kopplat till ansökan");
  return jobId;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const jobIdParam = searchParams.get("jobId");
  const applicationId = searchParams.get("applicationId");

  if (!jobIdParam && !applicationId) {
    return NextResponse.json(
      { error: "jobId eller applicationId krävs" },
      { status: 400 }
    );
  }
  try {
    const jobId = jobIdParam ?? (await resolveJobIdFromApplication(applicationId!));
    const stages = await getStagesForJob(jobId);
    return NextResponse.json({ stages });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Kunde inte hämta pipeline-steg" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, applicationId, candidateId, jobId, stageId, text } = body;

    if (action === "move") {
      if (!applicationId || !stageId) {
        return NextResponse.json(
          { error: "applicationId och stageId krävs" },
          { status: 400 }
        );
      }
      await moveCandidate(applicationId, stageId);
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      if (!applicationId || !jobId) {
        return NextResponse.json(
          { error: "applicationId och jobId krävs" },
          { status: 400 }
        );
      }
      const stages = await getStagesForJob(jobId);
      const target = stages.find(
        (s) => s.name.trim().toLowerCase() === "first interview"
      );
      if (!target) {
        const available = stages.map((s) => s.name).join(", ") || "inga steg";
        return NextResponse.json(
          {
            error: `Inget pipeline-steg med namnet "First Interview" hittades för detta jobb. Tillgängliga steg: ${available}`,
          },
          { status: 404 }
        );
      }
      await moveCandidate(applicationId, target.id);
      return NextResponse.json({ ok: true, stage: target.name });
    }

    if (action === "reject") {
      if (!applicationId) {
        return NextResponse.json(
          { error: "applicationId krävs" },
          { status: 400 }
        );
      }
      await rejectCandidate(applicationId);
      return NextResponse.json({ ok: true });
    }

    if (action === "note") {
      if (!candidateId || !text) {
        return NextResponse.json(
          { error: "candidateId och text krävs" },
          { status: 400 }
        );
      }
      await addNote(candidateId, text);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Okänd action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Åtgärd misslyckades" },
      { status: 500 }
    );
  }
}
