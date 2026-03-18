"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";

type JobState = {
  id: string;
  status: string;
  prompt?: string;
  message?: string;
  error?: string;
};

type Generation = {
  id: string;
  prompt: string;
  status: string;
  videoUrl?: string;
  seconds: number;
  model: string;
  createdAt: string;
};

export default function EditVideoPage() {
  const t = useT();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [manualId, setManualId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [loadingGenerations, setLoadingGenerations] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load existing completed generations
  useEffect(() => {
    fetch("/api/generations")
      .then((r) => r.json())
      .then((data: { items?: Generation[] }) => {
        const completed = (data.items ?? []).filter(
          (g) => g.status === "completed" && g.videoUrl,
        );
        setGenerations(completed);
      })
      .catch(() => {})
      .finally(() => setLoadingGenerations(false));
  }, []);

  const pollJobs = useCallback(() => {
    setJobs((current) => {
      const pending = current.filter(
        (j) => j.status !== "completed" && j.status !== "failed",
      );
      for (const job of pending) {
        fetch(`/api/edit-video?id=${job.id}`)
          .then((r) => r.json())
          .then((data: JobState) => {
            setJobs((prev) =>
              prev.map((j) => (j.id === data.id ? { ...j, ...data } : j)),
            );
          })
          .catch(() => {});
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const hasPending = jobs.some(
      (j) => j.status !== "completed" && j.status !== "failed",
    );
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(pollJobs, 8000);
    }
    if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobs, pollJobs]);

  const effectiveId = selectedId || manualId.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveId || !prompt.trim()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/edit-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: effectiveId, prompt: prompt.trim() }),
      });

      const data = (await response.json()) as JobState & { error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error || "Echec de la soumission.");
      }

      setJobs((prev) => [
        { id: data.id, status: data.status, prompt: prompt.trim() },
        ...prev,
      ]);
      setPrompt("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedGen = generations.find((g) => g.id === selectedId);

  return (
    <div className="page-shell">
      <div className="page-backdrop">
        <div className="app-header">
          <h1>{t.editVideo.title}</h1>
          <p style={{ color: "var(--text-soft)", marginTop: 6 }}>
            {t.editVideo.subtitle}
          </p>
        </div>

        {/* Source video selection */}
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: "1.05rem", marginBottom: 12 }}>{t.editVideo.chooseSource}</h2>

          {loadingGenerations ? (
            <p style={{ color: "var(--text-soft)" }}>{t.editVideo.loadingGenerations}</p>
          ) : generations.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              {generations.map((gen) => {
                const isSelected = selectedId === gen.id;
                return (
                  <button
                    key={gen.id}
                    onClick={() => {
                      setSelectedId(isSelected ? "" : gen.id);
                      if (!isSelected) setManualId("");
                    }}
                    style={{
                      position: "relative",
                      border: isSelected
                        ? "2px solid var(--accent)"
                        : "1px solid var(--panel-border)",
                      borderRadius: 16,
                      background: isSelected
                        ? "rgba(243, 145, 57, 0.1)"
                        : "var(--panel-soft)",
                      padding: 0,
                      cursor: "pointer",
                      overflow: "hidden",
                      textAlign: "left",
                    }}
                    type="button"
                  >
                    {gen.videoUrl ? (
                      <video
                        muted
                        onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                        onMouseLeave={(e) => {
                          const v = e.target as HTMLVideoElement;
                          v.pause();
                          v.currentTime = 0;
                        }}
                        playsInline
                        preload="metadata"
                        src={gen.videoUrl}
                        style={{
                          width: "100%",
                          aspectRatio: "9/16",
                          objectFit: "cover",
                          display: "block",
                          borderRadius: "14px 14px 0 0",
                        }}
                      />
                    ) : null}
                    <div style={{ padding: "8px 10px" }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.75rem",
                          color: "var(--text-soft)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {gen.prompt}
                      </p>
                      <p
                        style={{
                          margin: "3px 0 0",
                          fontSize: "0.68rem",
                          fontFamily: "var(--font-mono), monospace",
                          color: "var(--text-soft)",
                          opacity: 0.6,
                        }}
                      >
                        {gen.seconds}s · {gen.model}
                      </p>
                    </div>
                    {isSelected ? (
                      <div
                        style={{
                          position: "absolute",
                          top: 8,
                          right: 8,
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          color: "#1c1308",
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ color: "var(--text-soft)", fontSize: "0.9rem" }}>
              {t.editVideo.noCompletedGenerations}
            </p>
          )}

          <div className="field" style={{ maxWidth: 420 }}>
            <span style={{ fontSize: "0.85rem" }}>{t.editVideo.manualIdLabel}</span>
            <input
              onChange={(e) => {
                setManualId(e.target.value);
                if (e.target.value.trim()) setSelectedId("");
              }}
              placeholder={t.editVideo.manualIdPlaceholder}
              type="text"
              value={manualId}
            />
          </div>

          {/* Preview of selected */}
          {selectedGen?.videoUrl ? (
            <div style={{ marginTop: 12 }}>
              <video
                controls
                playsInline
                preload="metadata"
                src={selectedGen.videoUrl}
                style={{
                  maxHeight: 300,
                  borderRadius: 14,
                  border: "1px solid var(--panel-border)",
                }}
              />
            </div>
          ) : null}
        </section>

        {/* Edit prompt */}
        <form className="wizard-form" onSubmit={handleSubmit}>
          <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{t.editVideo.describeEdit}</h2>

          <div className="field">
            <span>{t.editVideo.editPromptLabel}</span>
            <textarea
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.editVideo.editPromptPlaceholder}
              required
              value={prompt}
            />
            <small style={{ color: "var(--text-soft)" }}>
              {t.editVideo.editHint}
            </small>
          </div>

          {submitError ? <p className="error-inline">{submitError}</p> : null}

          <button
            className="primary-button"
            disabled={submitting || !effectiveId || !prompt.trim()}
            type="submit"
          >
            {submitting ? t.editVideo.submitting : t.editVideo.launchEdit}
          </button>
        </form>

        {/* Job list */}
        {jobs.length > 0 ? (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: 14 }}>{t.editVideo.jobs}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {jobs.map((job) => (
                <div
                  className="static-field"
                  key={job.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <code
                      style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "0.82rem",
                      }}
                    >
                      {job.id}
                    </code>
                    {job.prompt ? (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "0.8rem",
                          color: "var(--text-soft)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.prompt}
                      </p>
                    ) : null}
                    <div style={{ marginTop: 6 }}>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {job.status === "completed" ? (
                      <a
                        className="primary-button compact-button"
                        href={`/api/edit-video/download?id=${job.id}`}
                        style={{
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        {t.editVideo.downloadMp4}
                      </a>
                    ) : null}
                    {job.status !== "completed" && job.status !== "failed" ? (
                      <button
                        className="secondary-button compact-button"
                        onClick={() => {
                          fetch(`/api/edit-video?id=${job.id}`)
                            .then((r) => r.json())
                            .then((data: JobState) =>
                              setJobs((prev) =>
                                prev.map((j) =>
                                  j.id === data.id ? { ...j, ...data } : j,
                                ),
                              ),
                            )
                            .catch(() => {});
                        }}
                        type="button"
                      >
                        {t.common.refresh}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: "rgba(95, 199, 161, 0.16)", text: "var(--success)" },
    failed: { bg: "rgba(255, 134, 134, 0.16)", text: "var(--danger)" },
  };

  const style = colors[status] ?? {
    bg: "rgba(243, 145, 57, 0.14)",
    text: "var(--accent)",
  };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 10,
        fontSize: "0.78rem",
        fontWeight: 600,
        background: style.bg,
        color: style.text,
      }}
    >
      {status}
    </span>
  );
}
