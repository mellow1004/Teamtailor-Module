"use client";

import { useEffect, useState } from "react";

type Stage = { id: string; name: string };

const stagesCache = new Map<string, Promise<Stage[]>>();

function fetchStagesFor(applicationId: string): Promise<Stage[]> {
  const cached = stagesCache.get(applicationId);
  if (cached) return cached;
  const promise = fetch(
    `/api/action?applicationId=${encodeURIComponent(applicationId)}`
  )
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunde inte hämta steg");
      return Array.isArray(data.stages) ? (data.stages as Stage[]) : [];
    })
    .catch((err) => {
      stagesCache.delete(applicationId);
      throw err;
    });
  stagesCache.set(applicationId, promise);
  return promise;
}

export type CandidateResult = {
  candidateId: string;
  applicationId: string;
  fullName: string;
  email: string | null;
  title: string | null;
  decision: "approve" | "reject" | "maybe";
  reason: string;
  score: number;
  flags?: string[];
};

export type ActionStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export type CvExperience = {
  company: string;
  role: string;
  duration: string;
};

export type CvState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      summary: string;
      score: number;
      strengths: string[];
      concerns: string[];
      experience?: CvExperience[];
    }
  | { status: "unavailable"; error: string };

type Props = {
  candidate: CandidateResult;
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
  action: ActionStatus;
  onRunAction: (action: "approve" | "reject") => void;
  cv: CvState;
};

const decisionStyle: Record<CandidateResult["decision"], { bg: string; label: string; dot: string }> = {
  approve: { bg: "bg-green-100 text-green-800", label: "Godkänd", dot: "bg-green-500" },
  maybe: { bg: "bg-yellow-100 text-yellow-800", label: "Kanske", dot: "bg-yellow-500" },
  reject: { bg: "bg-red-100 text-red-800", label: "Avvisad", dot: "bg-red-500" },
};

export function CandidateCard({
  candidate,
  selected,
  onSelectChange,
  action,
  onRunAction,
  cv,
}: Props) {
  const style = decisionStyle[candidate.decision];

  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [moveStatus, setMoveStatus] = useState<ActionStatus>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    fetchStagesFor(candidate.applicationId)
      .then((s) => {
        if (!cancelled) setStages(s);
      })
      .catch(() => {
        // dropdown stays empty; "Flytta"-knappen blir disabled
      });
    return () => {
      cancelled = true;
    };
  }, [candidate.applicationId]);

  async function runMove() {
    if (!selectedStageId) return;
    setMoveStatus({ status: "loading" });
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          applicationId: candidate.applicationId,
          stageId: selectedStageId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fel");
      const stageName = stages.find((s) => s.id === selectedStageId)?.name ?? "valt steg";
      setMoveStatus({ status: "done", message: `Flyttad till ${stageName}` });
    } catch (err: any) {
      setMoveStatus({ status: "error", message: err?.message || "Något gick fel" });
    }
  }

  const disabled =
    action.status === "loading" ||
    action.status === "done" ||
    moveStatus.status === "loading" ||
    moveStatus.status === "done";

  const displayStatus: ActionStatus =
    moveStatus.status !== "idle" ? moveStatus : action;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col gap-3 transition ${
        selected ? "border-brand-500 ring-2 ring-brand-100" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            aria-label={`Markera ${candidate.fullName}`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{candidate.fullName}</h3>
              <a
                href={`https://app.teamtailor.com/candidates/${candidate.candidateId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Öppna i Teamtailor"
                aria-label={`Öppna ${candidate.fullName} i Teamtailor`}
                className="shrink-0 text-gray-400 hover:text-brand-600 transition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </a>
            </div>
            {candidate.title && (
              <p className="text-sm text-gray-600 truncate">{candidate.title}</p>
            )}
            {candidate.email && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{candidate.email}</p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bg}`}>
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
            {style.label}
          </span>
          <span className="text-2xl font-bold text-gray-900">
            {candidate.score}
            <span className="text-sm font-normal text-gray-500">/10</span>
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">{candidate.reason}</p>

      {candidate.flags && candidate.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidate.flags.map((flag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800"
              title="Röd flagga från CV-/profilanalysen"
            >
              <span aria-hidden="true">⚑</span>
              {flag}
            </span>
          ))}
        </div>
      )}

      {cv.status !== "idle" && (
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              CV-analys
            </h4>
            {cv.status === "ok" && (
              <span className="text-sm font-bold text-gray-900">
                {cv.score}<span className="text-xs font-normal text-gray-500">/10</span>
              </span>
            )}
          </div>

          {cv.status === "loading" && (
            <div className="flex items-center gap-2 py-2">
              <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-600">Analyserar CV…</span>
            </div>
          )}

          {cv.status === "unavailable" && (
            <p className="text-xs text-gray-500 italic">CV ej tillgängligt</p>
          )}

          {cv.status === "ok" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-700">{cv.summary}</p>
              {(cv.experience ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1">Erfarenhet</p>
                  <ul className="text-xs text-gray-600 space-y-0.5">
                    {(cv.experience ?? []).map((e, i) => (
                      <li key={i} className="truncate">
                        <span className="font-medium text-gray-900">{e.company}</span>
                        {" · "}
                        <span>{e.role}</span>
                        {e.duration && (
                          <>
                            {" · "}
                            <span className="text-gray-500">{e.duration}</span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {cv.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700 mb-1">Styrkor</p>
                  <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                    {cv.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cv.concerns.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700 mb-1">Svagheter</p>
                  <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                    {cv.concerns.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <select
            value={selectedStageId}
            onChange={(e) => setSelectedStageId(e.target.value)}
            disabled={disabled || stages.length === 0}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Välj pipeline-steg"
          >
            <option value="">
              {stages.length === 0 ? "Laddar steg…" : "— välj steg —"}
            </option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={runMove}
            disabled={disabled || !selectedStageId}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
          >
            Flytta
          </button>
        </div>
        <button
          onClick={() => onRunAction("reject")}
          disabled={disabled}
          className="w-full px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          Reject
        </button>
      </div>

      {displayStatus.status === "loading" && (
        <p className="text-xs text-gray-500 text-center">Skickar till Teamtailor…</p>
      )}
      {displayStatus.status === "done" && (
        <p className="text-xs text-green-700 text-center font-medium">✓ {displayStatus.message}</p>
      )}
      {displayStatus.status === "error" && (
        <p className="text-xs text-red-700 text-center">{displayStatus.message}</p>
      )}
    </div>
  );
}
