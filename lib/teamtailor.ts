const BASE_URL = "https://api.teamtailor.com/v1";

export type Job = {
  id: string;
  title: string;
  status: string;
};

export type Stage = {
  id: string;
  name: string;
};

export type Candidate = {
  candidateId: string;
  applicationId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  title: string | null;
  experience: string | null;
  coverLetter: string | null;
  screeningAnswers: Array<{ question: string; answer: string }>;
  currentStage: { id: string; name: string } | null;
};

function headers(extra: Record<string, string> = {}) {
  const key = process.env.TEAMTAILOR_API_KEY;
  if (!key) throw new Error("TEAMTAILOR_API_KEY saknas i .env.local");
  return {
    Authorization: `Token token=${key}`,
    "X-Api-Version": "20180828",
    "Content-Type": "application/vnd.api+json",
    Accept: "application/vnd.api+json",
    ...extra,
  };
}

async function ttFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 403) {
      throw new Error(
        `Teamtailor 403 Forbidden på ${path}. API-nyckeln saknar troligen rättigheter för denna resurs (kandidater/ansökningar kräver oftast en Admin-nyckel, inte en publik nyckel).`
      );
    }
    throw new Error(`Teamtailor ${res.status} på ${path}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getJobs(): Promise<Job[]> {
  const data = await ttFetch(`/jobs?page%5Bsize%5D=30`);
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((j) => ({
      id: j.id,
      title: j.attributes?.title ?? "Namnlöst jobb",
      status: j.attributes?.status ?? "unknown",
    }))
    .filter((j) => j.status === "open");
}

export async function getStagesForJob(jobId: string): Promise<Stage[]> {
  const data = await ttFetch(`/jobs/${jobId}/stages`);
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows.map((s) => ({
    id: s.id,
    name: s.attributes?.name ?? "Steg",
  }));
}

export async function getCandidatesForJob(jobId: string): Promise<Candidate[]> {
  const stages = await getStagesForJob(jobId);
  const inbox = stages.find((s) => s.name.trim().toLowerCase() === "inbox");
  if (!inbox) return [];

  const PAGE_SIZE = 30;
  const MAX_PAGES = 50;
  const applications: any[] = [];
  const includedById = new Map<string, any>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await ttFetch(
      `/job-applications?filter%5Bjob%5D=${encodeURIComponent(jobId)}&filter%5Bstage%5D=${encodeURIComponent(inbox.id)}&include=candidate,stage&page%5Bsize%5D=${PAGE_SIZE}&page%5Bnumber%5D=${page}`
    );
    const pageApps: any[] = Array.isArray(data?.data) ? data.data : [];
    const pageIncluded: any[] = Array.isArray(data?.included) ? data.included : [];
    if (pageApps.length === 0) break;
    applications.push(...pageApps);
    for (const item of pageIncluded) {
      includedById.set(`${item.type}:${item.id}`, item);
    }
    const pageCount: number = Number(data?.meta?.["page-count"]) || 0;
    if (pageCount > 0 && page >= pageCount) break;
    if (pageApps.length < PAGE_SIZE) break;
  }

  const findIncluded = (type: string, id: string) =>
    includedById.get(`${type}:${id}`);

  const candidates: Candidate[] = [];

  for (const app of applications) {
    const candRef = app.relationships?.candidate?.data;
    const stageRef = app.relationships?.stage?.data;
    if (!candRef) continue;
    const cand = findIncluded("candidates", candRef.id);
    if (!cand) continue;

    const stage = stageRef ? findIncluded("stages", stageRef.id) : null;

    let screeningAnswers: Array<{ question: string; answer: string }> = [];
    try {
      const ans = await ttFetch(`/job-applications/${app.id}/answers?include=question`);
      const ansIncluded: any[] = Array.isArray(ans?.included) ? ans.included : [];
      const ansData: any[] = Array.isArray(ans?.data) ? ans.data : [];
      screeningAnswers = ansData.map((a) => {
        const qRef = a.relationships?.question?.data;
        const q = qRef ? ansIncluded.find((i) => i.type === "questions" && i.id === qRef.id) : null;
        return {
          question: q?.attributes?.title || "Fråga",
          answer: a.attributes?.value || a.attributes?.answer || "",
        };
      });
    } catch {
      screeningAnswers = [];
    }

    candidates.push({
      candidateId: cand.id,
      applicationId: app.id,
      firstName: cand.attributes["first-name"] || "",
      lastName: cand.attributes["last-name"] || "",
      fullName: [cand.attributes["first-name"], cand.attributes["last-name"]]
        .filter(Boolean)
        .join(" ") || "Okänd",
      email: cand.attributes.email || null,
      title: cand.attributes.title || cand.attributes.headline || null,
      experience:
        cand.attributes["resume-summary"] || null,
      coverLetter:
        app.attributes?.["cover-letter"] || cand.attributes?.["cover-letter"] || null,
      screeningAnswers,
      currentStage: stage
        ? { id: stage.id, name: stage.attributes?.name || "" }
        : null,
    });
  }

  return candidates;
}

export async function moveCandidate(applicationId: string, stageId: string) {
  return ttFetch(`/job-applications/${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        id: applicationId,
        type: "job-applications",
        relationships: {
          stage: { data: { type: "stages", id: stageId } },
        },
      },
    }),
  });
}

export async function rejectCandidate(applicationId: string) {
  return ttFetch(`/job-applications/${applicationId}/reject`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "application-rejections",
        attributes: { "send-mail": false },
      },
    }),
  });
}

export async function getCVForCandidate(candidateId: string): Promise<string> {
  const data = await ttFetch(`/candidates/${candidateId}`);
  const attrs = data?.data?.attributes || {};
  const fileUrl: string | undefined =
    attrs.resume || attrs["original-resume"];

  if (!fileUrl) {
    throw new Error("Kandidaten har inget CV uppladdat");
  }

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error(`Kunde inte ladda ner CV (HTTP ${fileRes.status})`);
  }

  const contentType = fileRes.headers.get("content-type") || "";
  if (!/pdf/i.test(contentType) && !fileUrl.toLowerCase().includes(".pdf")) {
    throw new Error(`CV är inte i PDF-format (content-type: ${contentType})`);
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const extracted = await extractText(pdf, { mergePages: true });
  const raw: string | string[] = extracted.text as string | string[];
  const text = (Array.isArray(raw) ? raw.join("\n") : raw).trim();
  if (!text) throw new Error("CV är tomt eller kunde inte läsas");
  return text;
}

export async function addNote(candidateId: string, text: string) {
  return ttFetch(`/notes`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "notes",
        attributes: { note: text },
        relationships: {
          candidate: { data: { type: "candidates", id: candidateId } },
        },
      },
    }),
  });
}
