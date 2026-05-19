"use client";

export type CandidateResult = {
  candidateId: string;
  applicationId: string;
  fullName: string;
  email: string | null;
  title: string | null;
  decision: "approve" | "reject" | "maybe";
  reason: string;
  score: number;
};

export type ActionStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export type CvState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      summary: string;
      score: number;
      strengths: string[];
      concerns: string[];
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
  const disabled = action.status === "loading" || action.status === "done";

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
            <h3 className="text-lg font-semibold text-gray-900 truncate">{candidate.fullName}</h3>
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
                  <p className="text-xs font-medium text-red-700 mb-1">Farhågor</p>
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

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => onRunAction("approve")}
          disabled={disabled}
          className="flex-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          First Interview
        </button>
        <button
          onClick={() => onRunAction("reject")}
          disabled={disabled}
          className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          Reject
        </button>
      </div>

      {action.status === "loading" && (
        <p className="text-xs text-gray-500 text-center">Skickar till Teamtailor…</p>
      )}
      {action.status === "done" && (
        <p className="text-xs text-green-700 text-center font-medium">✓ {action.message}</p>
      )}
      {action.status === "error" && (
        <p className="text-xs text-red-700 text-center">{action.message}</p>
      )}
    </div>
  );
}
