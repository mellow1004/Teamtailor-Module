"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CandidateCard,
  type ActionStatus,
  type CandidateResult,
  type CvState,
} from "@/components/CandidateCard";
import { parseLimit } from "@/lib/parseLimit";

type Job = { id: string; title: string; status: string };

type BulkAction = "" | "cv" | "approve" | "reject";

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [instruction, setInstruction] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("");
  const [results, setResults] = useState<CandidateResult[]>([]);
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
      const total = countData.candidates?.length ?? 0;
      const limit = parseLimit(instruction);
      const toAnalyze = limit && limit > 0 ? Math.min(limit, total) : total;
      setLoadingText(
        limit && limit < total
          ? `Analyserar ${toAnalyze} av ${total} kandidater…`
          : `Analyserar ${toAnalyze} kandidater…`
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analys misslyckades");

      setResults(data.results || []);
    } catch (err: any) {
      setError(err?.message || "Något gick fel");
    } finally {
      setLoading(false);
      setLoadingText("");
    }
  }

  const sorted = useMemo(
    () => [...results].sort((a, b) => b.score - a.score),
    [results]
  );

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.applicationId));

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((c) => c.applicationId)));
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
    const targets = sorted.filter((c) => selected.has(c.applicationId));
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
              onChange={(e) => setJobId(e.target.value)}
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

      {!loading && sorted.length > 0 && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Resultat ({sorted.length})
            </h2>

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

          <div className="grid sm:grid-cols-2 gap-4">
            {sorted.map((c) => (
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
