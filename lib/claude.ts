import Anthropic from "@anthropic-ai/sdk";
import type { Candidate } from "./teamtailor";

export type Decision = {
  candidateId: string;
  applicationId: string;
  decision: "approve" | "reject" | "maybe";
  reason: string;
  score: number;
  flags: string[];
};

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `Du är en expert rekryteringsassistent som bedömer kandidater mot rekryterarens kriterier.

VIKTIGT om instruktionen:
- Instruktionen beskriver KRITERIER att bedöma varje kandidat mot, inte hur många kandidater du ska analysera. Du bedömer alltid en kandidat åt gången.
- Om instruktionen anger ett antal (t.ex. "hitta 3 kandidater med X", "de fem bästa", "topp 10") är detta ett MÅLANTAL för hur många som bör godkännas — inte ett tak för hur många du analyserar. Bedöm varje kandidat på dess egna meriter mot kriterierna.
- Om en kandidat tydligt uppfyller kriterierna ska decision vara "approve". Om kandidaten tydligt inte uppfyller dem ska decision vara "reject". Använd "maybe" sparsamt, bara när bedömningen verkligen är osäker.
- Om användaren anger ett specifikt antal — returnera exakt det antalet som approve, rangordnade efter bäst matchning mot jobbannonsen. Om färre kandidater än efterfrågat antal håller tillräcklig kvalitet, returnera så många som möjligt och förklara i reason varför de övriga inte valdes.
- Om INGEN kandidat uppfyller kriterierna ska samtliga få "reject" — förklara i reason-fältet varför just den kandidaten inte når kraven.
- Tolka alltid intentionen om antal: formuleringar som "de 3 bästa", "tre stycken att kalla", "välj ut 3", "ge mig 5 namn", "topp 4" eller liknande betyder att användaren efterfrågar det antalet approve-kandidater. Resten får decision "reject" eller "maybe". Hur antalet hanteras i förhållande till kvalitet styrs av regeln ovan.

VIKTIGT om reason-fältet:
- För "reject": ange exakt vilket krav i instruktionen kandidaten inte uppfyller (t.ex. "Saknar erfarenhet av React" eller "Bor i Göteborg, instruktionen kräver Stockholm").
- För "approve": ange kort vilka av instruktionens krav kandidaten uppfyller.
- För "maybe": förklara vilken information som saknas för en säker bedömning.

JOBANNONS-ANALYS (gör detta först):
- Innan du bedömer kandidaten, identifiera 3–5 konkreta krav från jobbeskrivningen — täck erfarenhet, kompetens och personlighet. Använd bara krav som faktiskt står i annonsen; hitta inte på.
- Bedöm kandidaten explicit mot vart och ett av dessa krav: "uppfyller", "uppfyller ej" eller "oklar". Detta är din interna referensram för beslutet och behöver inte returneras i JSON.
- I reason-fältet ska du referera till specifika krav från jobbannonsen (t.ex. "Annonsen kräver 3 års erfarenhet av Salesforce — kandidaten har 5") snarare än generella omdömen ("stark profil", "passar bra").
- Om instruktionen från rekryteraren tillför ytterligare krav som inte står i annonsen ska du behandla även dessa enligt samma logik.

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

POÄNG OCH BESLUT (hård koppling):
- decision: "approve" KRÄVER score ≥ 7. Är poängen 6 eller lägre ska du INTE välja "approve".
- score 6 eller lägre → decision är alltid "maybe" eller "reject".
- Detta gäller även om kandidaten är "bäst i högen" — relativt bra räcker inte om poängen är låg.

SPRÅK:
- Svara alltid på svenska i reason-fältet, även om jobbeskrivningen eller kandidatens CV är på engelska.
- Använd kandidatens faktiska jobbtitlar och företagsnamn ordagrant i motiveringen (översätt eller parafrasera dem inte).

RÖDA FLAGGOR (fält: "flags"):
Returnera en lista med korta etiketter (1–4 ord vardera) för varje röd flagga kandidaten triggar. Lämna listan tom om inga gäller. Kolla alltid efter:
- "Inget eget bolag" — om rollen kräver fakturering/F-skatt men kandidaten saknar tydligt eget bolag.
- "Hög lönförväntan" — om angiven löneförväntning i screeningsvar eller cover letter klart överstiger vad som är rimligt för rollen och nivån.
- "Job hopping" — om kandidaten haft ≥3 anställningar på <12 månader vardera i rad.
- "Lucka i CV utan förklaring" — om det finns en sammanhängande period på ≥12 månader utan dokumenterad sysselsättning eller motivering.
- "Saknar relevant erfarenhet" — om kandidaten inte har någon yrkeserfarenhet alls som kan kopplas till rollen.
Lägg endast med flaggor du faktiskt kan belägga från profilen, inte spekulationer.

OPERATIV SÄLJFÖRMÅGA (villkorad — gäller endast vissa annonser):
- Om jobbeskrivningen explicit nämner cold calls, outbound, prospektering eller operativt säljarbete som krav — bedöm om kandidaten verkar hands-on eller enbart strategisk. Flagga "Troligen inte hands-on" om kandidaten de senaste 3 åren endast haft ledande roller utan operativt säljansvar. Lyft fram i reason om kandidaten explicit nämner cold calls eller eget pipeline. Om jobbeskrivningen INTE nämner dessa aktiviteter — ignorera denna bedömning helt.

SCREENINGSVAR (hård filtrering):
- Läs igenom ALLA screeningsvar innan du sätter decision och flags.
- Ett svar är "diskvalificerande" när det direkt motsäger ett krav i rollen — t.ex. frågan "Kan du fakturera oss?" besvarad "Nej" för en konsultroll, eller "Har du svenskt arbetstillstånd?" besvarad "Nej" när det krävs.
- För varje diskvalificerande svar: lägg in en flag-post med EXAKT formatet "Svar på '[frågan]': [svaret]" (citattecken runt frågetexten). Detta är ett undantag från 1–4-ords-regeln ovan.
- Kandidater med minst ett diskvalificerande screeningsvar ska ALLTID få decision: "reject", oavsett hur stark profilen är i övrigt.
- När orsaken är ett screeningsvar MÅSTE reason-fältet börja med exakt texten "Screeningfråga:" (med kolon, första bokstaven versal) följt av förklaringen — t.ex. "Screeningfråga: Svarade Nej på 'Do you have your own company'." Inga andra reject-orsaker får använda detta prefix.

Returnera alltid JSON. Max 2 meningar i reason-fältet.`;

function buildPrompt(
  candidate: Candidate,
  instruction: string,
  jobDescription: string,
  cvText?: string
): string {
  const screening = candidate.screeningAnswers
    .map((s) => `Q: ${s.question}\nA: ${s.answer}`)
    .join("\n\n") || "Inga screeningsvar";

  const jobSection = jobDescription
    ? `Jobbet (från Teamtailor):
${jobDescription}

`
    : "";

  const trimmedCv = (cvText || "").trim();
  const cvSection = trimmedCv
    ? `\n\nCV-innehåll:\n${trimmedCv.length > 18000 ? trimmedCv.slice(0, 18000) + "\n[avkortat]" : trimmedCv}`
    : "";

  return `${jobSection}Instruktion från rekryterare:
${instruction}

Kandidat:
- Namn: ${candidate.fullName}
- Email: ${candidate.email || "saknas"}
- Titel: ${candidate.title || "saknas"}
- Erfarenhet/CV: ${candidate.experience || "saknas"}
- Cover letter: ${candidate.coverLetter || "saknas"}${cvSection}

Screeningsvar:
${screening}

Returnera ENDAST ett JSON-objekt på exakt detta format (inga andra tecken före eller efter):
{
  "decision": "approve" | "reject" | "maybe",
  "reason": "kort motivering på svenska, max 2 meningar",
  "score": <heltal 1-10>,
  "flags": ["kort etikett", "..."]
}`;
}

function extractJson(text: string): {
  decision: string;
  reason: string;
  score: number;
  flags?: unknown;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Inget JSON-objekt hittades i Claudes svar");
  return JSON.parse(match[0]);
}

export type CvExperience = {
  company: string;
  role: string;
  duration: string;
};

export type CvAnalysis = {
  summary: string;
  score: number;
  strengths: string[];
  concerns: string[];
  experience: CvExperience[];
};

const CV_SYSTEM_PROMPT = `Du är en expert rekryteringsassistent som analyserar CV:n. Returnera alltid JSON. Svara på svenska.

Riktlinjer för "summary":
- Max 2 meningar. Skriv bara det MEST relevanta för en rekryterare som snabbt vill bedöma kandidaten.
- Undvik fluff. Nämn senioritetsnivå, huvudsaklig kompetensprofil och vad kandidaten är känd för i sin senaste roll.

Riktlinjer för "experience":
- Lista kandidatens yrkeserfarenheter i fallande kronologisk ordning (senaste först).
- För varje post: bolagsnamn ordagrant, exakt rolltitel ordagrant, och "duration" som ett människoläsbart spann på svenska (t.ex. "2 år 3 månader", "8 månader", "5+ år").
- Räkna duration utifrån datumen i CV:t. Är slutdatum tomt eller "Pågående", räkna till idag.
- Hoppa över utbildning, praktik utan företag, och uppdrag som inte har både ett tydligt företagsnamn och en titel.

Riktlinjer för "strengths" och "concerns":
- Varje punkt ska vara KORT och FAKTABASERAD — max 5–7 ord.
- Lyft bara sådant som FAKTISKT står i CV:t. Inga egna slutsatser, tolkningar eller spekulationer.
- Gör: "1 år på Stena Recycling", "MSc Computer Science KTH", "Certifierad AWS Solutions Architect".
- Gör INTE: "Kort anställning som kan väcka frågor om orsak till avslut", "Verkar engagerad i AI", "Kan vara redo för nästa steg".
- "strengths" = positiva fakta värda att framhäva. "concerns" = neutrala fakta som rekryteraren bör notera (korta anställningar, byten, luckor — utan att tolka dem).`;

function buildCvPrompt(cvText: string): string {
  const trimmed = cvText.length > 18000 ? cvText.slice(0, 18000) + "\n[avkortat]" : cvText;
  return `Analysera följande CV och returnera ENDAST ett JSON-objekt på exakt detta format (inga andra tecken före eller efter):
{
  "summary": "max 2 meningar — det mest relevanta för en rekryterare",
  "score": <heltal 1-10 baserat på övergripande styrka>,
  "strengths": ["styrka 1", "styrka 2", "styrka 3"],
  "concerns": ["farhåga 1", "farhåga 2"],
  "experience": [
    { "company": "Bolagsnamn", "role": "Titel", "duration": "2 år 3 månader" }
  ]
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
    max_tokens: 1500,
    system: CV_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCvPrompt(cvText) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Inget JSON-objekt hittades i Claudes svar");
  const parsed = JSON.parse(match[0]);

  const experience: CvExperience[] = Array.isArray(parsed.experience)
    ? (parsed.experience as unknown[])
        .map((e) => {
          const obj = (e ?? {}) as Record<string, unknown>;
          return {
            company: String(obj.company ?? "").trim(),
            role: String(obj.role ?? "").trim(),
            duration: String(obj.duration ?? "").trim(),
          };
        })
        .filter((e) => e.company.length > 0 && e.role.length > 0)
    : [];

  return {
    summary: String(parsed.summary || "Ingen sammanfattning"),
    score: Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5))),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String) : [],
    experience,
  };
}

export async function processCandidates(
  candidates: Candidate[],
  instruction: string,
  jobDescription: string = "",
  cvByApplicationId?: Record<string, string>
): Promise<Decision[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY saknas i .env.local");

  const client = new Anthropic({ apiKey });

  const results = await Promise.all(
    candidates.map(async (cand) => {
      try {
        const cvText = cvByApplicationId?.[cand.applicationId];
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: 700,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPrompt(cand, instruction, jobDescription, cvText) }],
        });

        const textBlock = message.content.find((b) => b.type === "text");
        const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
        const parsed = extractJson(text);

        const decision: "approve" | "reject" | "maybe" =
          parsed.decision === "approve" || parsed.decision === "reject"
            ? parsed.decision
            : "maybe";

        const score = Math.max(1, Math.min(10, Math.round(Number(parsed.score) || 5)));

        const flags = Array.isArray(parsed.flags)
          ? (parsed.flags as unknown[])
              .map((f) => String(f).trim())
              .filter((f) => f.length > 0)
          : [];

        return {
          candidateId: cand.candidateId,
          applicationId: cand.applicationId,
          decision,
          reason: parsed.reason || "Ingen motivering.",
          score,
          flags,
        } satisfies Decision;
      } catch (err: any) {
        return {
          candidateId: cand.candidateId,
          applicationId: cand.applicationId,
          decision: "maybe" as const,
          reason: `Kunde inte analysera: ${err?.message || "okänt fel"}`,
          score: 5,
          flags: [],
        };
      }
    })
  );

  return results;
}
