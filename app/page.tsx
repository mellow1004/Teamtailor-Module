"use client";

import { useEffect, useState } from "react";
import {
  CandidateCard,
  type ActionStatus,
  type CandidateResult,
  type CvState,
} from "@/components/CandidateCard";
import { parseLimit } from "@/lib/parseLimit";

type Job = { id: string; title: string; status: string };

type BulkAction = "" | "cv" | "approve" | "reject";

const STORAGE_PREFIX = "tt-ai-results:";

function loadResults(jobId: string): CandidateResult[] {
  if (!jobId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${jobId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveResults(jobId: string, results: CandidateResult[]) {
  if (!jobId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${jobId}`,
      JSON.stringify(results)
    );
  } catch {
    // quota exceeded or storage disabled — silently ignore
  }
}

function removeResults(jobId: string) {
  if (!jobId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${jobId}`);
  } catch {
    // ignore
  }
}

const CANDIDATE_CACHE_PREFIX = "candidate-result-";

function loadCachedResult(applicationId: string): CandidateResult | null {
  if (!applicationId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      `${CANDIDATE_CACHE_PREFIX}${applicationId}`
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as CandidateResult) : null;
  } catch {
    return null;
  }
}

function saveCachedResult(result: CandidateResult) {
  if (!result?.applicationId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      `${CANDIDATE_CACHE_PREFIX}${result.applicationId}`,
      JSON.stringify(result)
    );
  } catch {
    // ignore quota/storage errors
  }
}

function clearAllCachedResults() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(CANDIDATE_CACHE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [instruction, setInstruction] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("");
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [requestedLimit, setRequestedLimit] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [jobsError, setJobsError] = useState<string>("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionByApp, setActionByApp] = useState<Record<string, ActionStatus>>({});
  const [cvByApp, setCvByApp] = useState<Record<string, CvState>>({});
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fel vid hämtning av jobb");
        setJobs(data.jobs || []);
      } catch (err: any) {
        setJobsError(err?.message || "Kunde inte hämta jobb");
      }
    })();
  }, []);

  async function runAnalysis() {
    if (!jobId || !instruction.trim()) {
      setError("Välj ett jobb och skriv en instruktion.");
      return;
    }
    setError("");
    setResults([]);
    setSelected(new Set());
    setActionByApp({});
    setCvByApp({});
    setLoading(true);
    setLoadingText("Hämtar kandidater…");

    try {
      const countRes = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const countData = await countRes.json();
      const candidates: Array<{ applicationId: string }> = countData.candidates || [];
      const total = candidates.length;
      const limit = parseLimit(instruction);
      const considered = limit && limit > 0 ? candidates.slice(0, limit) : candidates;

      const cachedIds: string[] = [];
      const cachedResults: CandidateResult[] = [];
      for (const c of considered) {
        const cached = loadCachedResult(c.applicationId);
        if (cached) {
          cachedIds.push(c.applicationId);
          cachedResults.push(cached);
        }
      }

      const freshCount = considered.length - cachedIds.length;
      setLoadingText(
        cachedIds.length > 0
          ? `Analyserar ${freshCount} nya kandidater (${cachedIds.length} cachade)…`
          : limit && limit < total
            ? `Analyserar ${considered.length} av ${total} kandidater…`
            : `Analyserar ${considered.length} kandidater…`
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, instruction, cachedIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analys misslyckades");

      const fresh: CandidateResult[] = data.results || [];
      for (const r of fresh) saveCachedResult(r);
      const merged = [...fresh, ...cachedResults];
      const sortedResults = merged.sort((a, b) => b.score - a.score);
      setResults(sortedResults);
      setRequestedLimit(typeof data.limit === "number" ? data.limit : null);
      saveResults(jobId, sortedResults);
      setSavedCount(sortedResults.length);
    } catch (err: any) {
      setError(err?.message || "Något gick fel");
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  const allSelected = results.length > 0 && results.every((c) => selected.has(c.applicationId));

  function handleJobChange(newJobId: string) {
    setJobId(newJobId);
    setSelected(new Set());
    setActionByApp({});
    setCvByApp({});
    setError("");
    setRequestedLimit(null);
    setResults([]);
    setSavedCount(newJobId ? loadResults(newJobId).length : 0);
  }

  function loadSavedResults() {
    if (!jobId) return;
    const saved = loadResults(jobId);
    if (saved.length === 0) return;
    setResults(saved);
  }

  function clearResults() {
    setResults([]);
    setRequestedLimit(null);
    setSelected(new Set());
    setActionByApp({});
    setCvByApp({});
    setSavedCount(0);
    if (jobId) removeResults(jobId);
  }

  function clearCache() {
    clearAllCachedResults();
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((c) => c.applicationId)));
    }
  }

  function toggleOne(applicationId: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  }

  async function runActionFor(
    candidate: CandidateResult,
    act: "approve" | "reject"
  ) {
    setActionByApp((prev) => ({
      ...prev,
      [candidate.applicationId]: { status: "loading" },
    }));
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: act,
          applicationId: candidate.applicationId,
          candidateId: candidate.candidateId,
          jobId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fel");
      setActionByApp((prev) => ({
        ...prev,
        [candidate.applicationId]: {
          status: "done",
          message:
            act === "approve"
              ? `Flyttad till ${data.stage ?? "First Interview"}`
              : "Avvisad",
        },
      }));
    } catch (err: any) {
      setActionByApp((prev) => ({
        ...prev,
        [candidate.applicationId]: {
          status: "error",
          message: err?.message || "Något gick fel",
        },
      }));
    }
  }

  async function analyzeCvFor(candidate: CandidateResult) {
    setCvByApp((prev) => ({
      ...prev,
      [candidate.applicationId]: { status: "loading" },
    }));
    try {
      const res = await fetch("/api/cv-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: [
            { candidateId: candidate.candidateId, applicationId: candidate.applicationId },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fel");
      const r = data.results?.[0];
      if (!r || r.status === "unavailable") {
        setCvByApp((prev) => ({
          ...prev,
          [candidate.applicationId]: {
            status: "unavailable",
            error: r?.error || "CV ej tillgängligt",
          },
        }));
        return;
      }
      setCvByApp((prev) => ({
        ...prev,
        [candidate.applicationId]: {
          status: "ok",
          summary: r.summary,
          score: r.score,
          strengths: r.strengths || [],
          concerns: r.concerns || [],
          experience: r.experience || [],
        },
      }));
    } catch (err: any) {
      setCvByApp((prev) => ({
        ...prev,
        [candidate.applicationId]: {
          status: "unavailable",
          error: err?.message || "CV ej tillgängligt",
        },
      }));
    }
  }

  async function runBulk() {
    if (!bulkAction || selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    const targets = results.filter((c) => selected.has(c.applicationId));
    try {
      if (bulkAction === "cv") {
        await Promise.all(targets.map((c) => analyzeCvFor(c)));
      } else {
        await Promise.all(targets.map((c) => runActionFor(c, bulkAction)));
      }
    } finally {
      setBulkBusy(false);
      setBulkAction("");
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
          Rekryteringsassistenten
        </h1>
        <p className="text-gray-600 mt-2">
          AI-driven kandidatanalys kopplad till Teamtailor.
        </p>
      </header>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="grid gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Välj jobb
            </label>
            <select
              value={jobId}
              onChange={(e) => handleJobChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="">— välj ett jobb —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
            {jobsError && (
              <p className="mt-2 text-xs text-red-600">{jobsError}</p>
            )}
            {jobId && savedCount > 0 && results.length === 0 && !loading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <span>
                  Du har tidigare analyserat {savedCount} kandidater för detta jobb. Vill du läsa in dem?
                </span>
                <button
                  type="button"
                  onClick={loadSavedResults}
                  className="text-brand-600 hover:text-brand-700 font-medium underline-offset-2 hover:underline transition"
                >
                  Läs in tidigare resultat
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Instruktion till AI:n
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              placeholder="T.ex. Hitta kandidater med minst 3 års erfarenhet av React och som bor i Stockholm."
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-y"
              disabled={loading}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runAnalysis}
              disabled={loading || !jobId || !instruction.trim()}
              className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
            >
              {loading ? "Kör…" : "Kör analys"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>
      </section>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-12">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-700">{loadingText || "Bearbetar…"}</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                Resultat ({results.length})
              </h2>
              <button
                onClick={clearResults}
                className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline transition"
              >
                Rensa resultat
              </button>
              <button
                onClick={clearCache}
                title="Tar bort sparade poäng per kandidat — nästa analys bedöms helt på nytt"
                className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline transition"
              >
                Rensa cache
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Markera alla
              </label>

              <div className="flex items-center gap-2">
                <select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as BulkAction)}
                  disabled={selected.size === 0 || bulkBusy}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Åtgärder ({selected.size} valda)</option>
                  <option value="cv">Analysera CV</option>
                  <option value="approve">Flytta till First Interview</option>
                  <option value="reject">Avvisa</option>
                </select>
                <button
                  onClick={runBulk}
                  disabled={!bulkAction || selected.size === 0 || bulkBusy}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
                >
                  {bulkBusy ? "Kör…" : "Utför"}
                </button>
              </div>
            </div>
          </div>

          {(() => {
            const approvedCount = results.filter((r) => r.decision === "approve").length;
            const maxScore = results.reduce((m, r) => Math.max(m, r.score), 0);
            if (approvedCount === 0) {
              return (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
                  Inga tillräckligt starka kandidater hittades för denna instruktion. Bästa tillgängliga kandidat fick {maxScore}/10.
                </div>
              );
            }
            if (
              requestedLimit !== null &&
              requestedLimit > approvedCount
            ) {
              return (
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  Endast {approvedCount} av efterfrågade {requestedLimit} kandidater uppfyllde kriterierna.
                </div>
              );
            }
            return null;
          })()}

          <div className="grid sm:grid-cols-2 gap-4">
            {results.map((c) => (
              <CandidateCard
                key={c.applicationId}
                candidate={c}
                selected={selected.has(c.applicationId)}
                onSelectChange={(on) => toggleOne(c.applicationId, on)}
                action={actionByApp[c.applicationId] ?? { status: "idle" }}
                onRunAction={(act) => runActionFor(c, act)}
                cv={cvByApp[c.applicationId] ?? { status: "idle" }}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
