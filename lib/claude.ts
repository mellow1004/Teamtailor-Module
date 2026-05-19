import Anthropic from "@anthropic-ai/sdk";
import type { Candidate } from "./teamtailor";

export type Decision = {
  candidateId: string;
  applicationId: string;
  decision: "approve" | "reject" | "maybe";
  reason: string;
  score: number;
};

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT =
  "Du är en expert rekryteringsassistent. Analysera kandidatprofiler mot given instruktion. Returnera alltid JSON. Svara på svenska.";

function buildPrompt(candidate: Candidate, instruction: string): string {
  const screening = candidate.screeningAnswers
    .map((s) => `Q: ${s.question}\nA: ${s.answer}`)
    .join("\n\n") || "Inga screeningsvar";

  return `Instruktion från rekryterare:
${instruction}

Kandidat:
- Namn: ${candidate.fullName}
- Email: ${candidate.email || "saknas"}
- Titel: ${candidate.title || "saknas"}
- Erfarenhet/CV: ${candidate.experience || "saknas"}
- Cover letter: ${candidate.coverLetter || "saknas"}

Screeningsvar:
${screening}

Returnera ENDAST ett JSON-objekt på exakt detta format (inga andra tecken före eller efter):
{
  "decision": "approve" | "reject" | "maybe",
  "reason": "kort motivering på svenska, max 2 meningar",
  "score": <heltal 1-10>
}`;
}

function extractJson(text: string): { decision: string; reason: string; score: number } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Inget JSON-objekt hittades i Claudes svar");
  return JSON.parse(match[0]);
}

export type CvAnalysis = {
  summary: string;
  score: number;
  strengths: string[];
  concerns: string[];
};

const CV_SYSTEM_PROMPT =
  "Du är en expert rekryteringsassistent som analyserar CV:n. Returnera alltid JSON. Svara på svenska.";

function buildCvPrompt(cvText: string): string {
  const trimmed = cvText.length > 18000 ? cvText.slice(0, 18000) + "\n[avkortat]" : cvText;
  return `Analysera följande CV och returnera ENDAST ett JSON-objekt på exakt detta format (inga andra tecken före eller efter):
{
  "summary": "kort sammanfattning på svenska, max 3 meningar",
  "score": <heltal 1-10 baserat på övergripande styrka>,
  "strengths": ["styrka 1", "styrka 2", "styrka 3"],
  "concerns": ["farhåga 1", "farhåga 2"]
}

CV-text:
${trimmed}`;
}

export async function analyzeCv(cvText: string): Promise<CvAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas i .env.local");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: CV_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCvPrompt(cvText) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Inget JSON-objekt hittades i Claudes svar");
  const parsed = JSON.parse(match[0]);

  return {
    summary: String(parsed.summary || "Ingen sammanfattning"),
    score: Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5))),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
  };
}

export async function processCandidates(
  candidates: Candidate[],
  instruction: string
): Promise<Decision[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas i .env.local");

  const client = new Anthropic({ apiKey });

  const results = await Promise.all(
    candidates.map(async (cand) => {
      try {
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPrompt(cand, instruction) }],
        });

        const textBlock = message.content.find((b) => b.type === "text");
        const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
        const parsed = extractJson(text);

        const decision: "approve" | "reject" | "maybe" =
          parsed.decision === "approve" || parsed.decision === "reject"
            ? parsed.decision
            : "maybe";

        const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));

        return {
          candidateId: cand.candidateId,
          applicationId: cand.applicationId,
          decision,
          reason: parsed.reason || "Ingen motivering.",
          score,
        } satisfies Decision;
      } catch (err: any) {
        return {
          candidateId: cand.candidateId,
          applicationId: cand.applicationId,
          decision: "maybe" as const,
          reason: `Kunde inte analysera: ${err?.message || "okänt fel"}`,
          score: 5,
        };
      }
    })
  );

  return results;
}
