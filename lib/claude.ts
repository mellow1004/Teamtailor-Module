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

const SYSTEM_PROMPT = `Du är en expert rekryteringsassistent som bedömer kandidater mot rekryterarens kriterier.

VIKTIGT om instruktionen:
- Instruktionen beskriver KRITERIER att bedöma varje kandidat mot, inte hur många kandidater du ska analysera. Du bedömer alltid en kandidat åt gången.
- Om instruktionen anger ett antal (t.ex. "hitta 3 kandidater med X", "de fem bästa", "topp 10") är detta ett MÅLANTAL för hur många som bör godkännas — inte ett tak för hur många du analyserar. Bedöm varje kandidat på dess egna meriter mot kriterierna.
- Om en kandidat tydligt uppfyller kriterierna ska decision vara "approve". Om kandidaten tydligt inte uppfyller dem ska decision vara "reject". Använd "maybe" sparsamt, bara när bedömningen verkligen är osäker.
- Om färre kandidater uppfyller kraven än målantalet ska du INTE sänka ribban för att fylla kvoten. Det är bättre att godkänna få och starka än många svaga.

VIKTIGT om reason-fältet:
- För "reject": ange exakt vilket krav i instruktionen kandidaten inte uppfyller (t.ex. "Saknar erfarenhet av React" eller "Bor i Göteborg, instruktionen kräver Stockholm").
- För "approve": ange kort vilka av instruktionens krav kandidaten uppfyller.
- För "maybe": förklara vilken information som saknas för en säker bedömning.

TOLKNING AV INSTRUKTIONER:
- "erfarenhet av X" = minst 1 års dokumenterad yrkeserfarenhet av X.
- "stark i X" eller "bra på X" = X ska vara en tydlig och återkommande del av kandidatens bakgrund, inte bara nämnt i förbifarten.
- "potential att bli X" = leta efter ledaregenskaper, tydlig karriärprogression och ökat ansvar över tid.
- "inte X" eller "inga X" = HÅRT krav. Kandidater som matchar X ska alltid få "reject", oavsett övriga meriter.
- "helst X" = MJUKT krav. Påverkar score uppåt om uppfyllt, men är inte uteslutande.
- "minst X års erfarenhet" = HÅRT krav. Kandidater under gränsen ska alltid få "reject".

BEDÖMNINGSORDNING:
1. Kontrollera hårda krav först — uppfylls de inte är beslutet alltid "reject", oavsett hur stark kandidaten är på andra områden.
2. Bedöm därefter mjuka krav och sätt score (1–10) baserat på hur väl kandidaten matchar helheten.
3. Motivera alltid med konkreta exempel från kandidatens profil ("5 år som Backend Engineer på Spotify"), inte med generella påståenden ("har relevant erfarenhet").

SPRÅK:
- Svara alltid på svenska i reason-fältet, även om jobbeskrivningen eller kandidatens CV är på engelska.
- Använd kandidatens faktiska jobbtitlar och företagsnamn ordagrant i motiveringen (översätt eller parafrasera dem inte).

Returnera alltid JSON. Max 2 meningar i reason-fältet.`;

function buildPrompt(
  candidate: Candidate,
  instruction: string,
  jobDescription: string
): string {
  const screening = candidate.screeningAnswers
    .map((s) => `Q: ${s.question}\nA: ${s.answer}`)
    .join("\n\n") || "Inga screeningsvar";

  const jobSection = jobDescription
    ? `Jobbet (från Teamtailor):
${jobDescription}

`
    : "";

  return `${jobSection}Instruktion från rekryterare:
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
  instruction: string,
  jobDescription: string = ""
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
          messages: [{ role: "user", content: buildPrompt(cand, instruction, jobDescription) }],
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
