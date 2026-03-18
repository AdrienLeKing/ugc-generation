"use client";

import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DURATION_OPTIONS,
  MODEL_OPTIONS,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import type { GenerationRecord, SoraModel, VerticalSize } from "@/lib/sora/types";

type DashboardResponse = {
  envReady: boolean;
  elevenLabsReady: boolean;
  pollIntervalMs: number;
  items: GenerationRecord[];
  backendError?: string;
};

async function requestDashboard() {
  const response = await fetch("/api/generations", {
    cache: "no-store",
  });

  const payload = (await response.json()) as DashboardResponse | { error: string };

  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : "Impossible de recuperer les generations.");
  }

  return payload;
}

const statusLabels: Record<GenerationRecord["status"], string> = {
  queued: "En file",
  in_progress: "En cours",
  completed: "Termine",
  failed: "Echec",
  unknown: "Etat inconnu",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function statusTone(status: GenerationRecord["status"]) {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "danger";
    case "in_progress":
      return "accent";
    default:
      return "neutral";
  }
}

function sizeLabel(size: VerticalSize) {
  return VERTICAL_SIZE_OPTIONS.find((option) => option.value === size)?.label ?? size;
}

function modelLabel(model: SoraModel) {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}

function FollowupAudioPanel({
  item,
  elevenLabsReady,
  onComplete,
}: {
  item: GenerationRecord;
  elevenLabsReady: boolean;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(item.voiceoverScript ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.status !== "completed" || !item.videoUrl) {
    return null;
  }

  if (!elevenLabsReady) {
    return (
      <div className="followup-notice">
        <small>Ajoutez ELEVENLABS_API_KEY dans .env.local pour generer l&apos;audio de suite.</small>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/generations/${item.id}/followup-audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "La generation audio a echoue.");
      }

      setOpen(false);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "La generation audio a echoue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="followup-block">
      {item.voiceoverUrl ? (
        <div className="asset-block">
          <div className="asset-header">
            <span>Audio de suite</span>
            <a href={item.voiceoverUrl} rel="noreferrer" target="_blank">
              Telecharger
            </a>
          </div>
          <audio className="audio-preview" controls preload="metadata" src={item.voiceoverUrl} />
          {item.voiceoverScript ? (
            <p className="followup-script">{item.voiceoverScript}</p>
          ) : null}
        </div>
      ) : null}

      {!open ? (
        <button
          className="secondary-button followup-trigger"
          onClick={() => setOpen(true)}
          type="button"
        >
          {item.voiceoverUrl ? "Regenerer l'audio de suite" : "Generer l'audio de suite"}
        </button>
      ) : (
        <form className="followup-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Texte de continuation</span>
            <textarea
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              placeholder="Ecrivez le script que la voix clonee prononcera..."
              required
              rows={4}
              value={text}
            />
          </label>

          {error ? <p className="error-inline">{error}</p> : null}

          <div className="followup-actions">
            <button className="primary-button" disabled={busy || !text.trim()} type="submit">
              {busy ? "Generation en cours..." : "Generer"}
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => { setOpen(false); setError(null); }}
              type="button"
            >
              Annuler
            </button>
          </div>

          {busy ? (
            <div className="followup-progress">
              <div className="progress-rail">
                <div className="progress-bar followup-progress-bar" />
              </div>
              <small>Extraction audio, clonage de voix, synthese vocale...</small>
            </div>
          ) : null}
        </form>
      )}
    </div>
  );
}

export function SoraStudio() {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [envReady, setEnvReady] = useState(false);
  const [elevenLabsReady, setElevenLabsReady] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(10_000);
  const [spokenText, setSpokenText] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [model, setModel] = useState<SoraModel>(DEFAULT_MODEL);
  const [seconds, setSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const activeCount = items.filter((item) => item.status === "queued" || item.status === "in_progress").length;

  function applyDashboardPayload(payload: DashboardResponse) {
    startTransition(() => {
      setItems(payload.items);
      setEnvReady(payload.envReady);
      setElevenLabsReady(payload.elevenLabsReady);
      setPollIntervalMs(payload.pollIntervalMs);
    });

    setErrorMessage(payload.backendError ?? null);
  }

  async function refreshDashboard(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const payload = await requestDashboard();
      applyDashboardPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de recuperer les generations.");
    } finally {
      setRefreshing(false);
    }
  }

  const refreshDashboardEffect = useEffectEvent(async (showSpinner: boolean) => {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const payload = await requestDashboard();
      applyDashboardPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de recuperer les generations.");
    } finally {
      setRefreshing(false);
    }
  });

  useEffect(() => {
    return () => {
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
    };
  }, [referencePreviewUrl]);

  useEffect(() => {
    void refreshDashboardEffect(true);
  }, []);

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      void refreshDashboardEffect(false);
    }, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [pollIntervalMs]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("spokenText", spokenText);
      formData.set("sceneDescription", sceneDescription);
      formData.set("model", model);
      formData.set("seconds", String(seconds));

      if (referenceImage) {
        formData.set("referenceImage", referenceImage);
      }

      const response = await fetch("/api/generations", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "La generation a echoue.");
      }

      await refreshDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "La generation a echoue.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setReferenceImage(file);

    if (referencePreviewUrl) {
      URL.revokeObjectURL(referencePreviewUrl);
    }

    if (file) {
      setReferencePreviewUrl(URL.createObjectURL(file));
      return;
    }

    setReferencePreviewUrl(null);
  }

  return (
    <main className="page-shell">
      <div className="page-backdrop" />

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Hook generator</span>
          <h1>Photo de la creatrice, texte prononce, scene, puis generation du hook vertical.</h1>
          <p>
            L&apos;outil est maintenant concentre sur un seul usage: generer un hook face camera a partir de la photo
            de la creatrice, de ce qu&apos;elle dit exactement, et de la direction de scene.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span>Generations actives</span>
            <strong>{activeCount}</strong>
          </div>
          <div className="stat-card">
            <span>Historique local</span>
            <strong>{items.length}</strong>
          </div>
          <div className="stat-card">
            <span>Rafraichissement</span>
            <strong>{Math.round(pollIntervalMs / 1000)} s</strong>
          </div>
          <div className="stat-card">
            <span>Format</span>
            <strong>9:16</strong>
          </div>
        </div>
      </section>

      <section className="studio-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <h2>Generer un hook</h2>
              <p>Vertical TikTok fixe, une seule generation a la fois.</p>
            </div>
            <span className={`badge ${envReady ? "badge-success" : "badge-danger"}`}>
              {envReady ? "Cle API detectee" : "Cle API manquante"}
            </span>
          </div>

          <label className="field">
            <span>Texte prononce par la creatrice</span>
            <textarea
              value={spokenText}
              onChange={(event) => setSpokenText(event.target.value)}
              rows={5}
              placeholder='Exemple: "Stop, si ta peau tiraille apres chaque douche, il faut vraiment voir ca."'
              required
            />
          </label>

          <label className="field">
            <span>Scene et settings</span>
            <textarea
              value={sceneDescription}
              onChange={(event) => setSceneDescription(event.target.value)}
              rows={4}
              placeholder="Exemple: Face camera dans une salle de bain lumineuse, cadrage poitrine, energie naturelle, debit rapide, ton UGC premium, leger mouvement smartphone."
              required
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Modele</span>
              <select value={model} onChange={(event) => setModel(event.target.value as SoraModel)}>
                {MODEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>{MODEL_OPTIONS.find((option) => option.value === model)?.description}</small>
            </label>

            <label className="field">
              <span>Duree</span>
              <select value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Photo de la creatrice</span>
            <input accept="image/*" required type="file" onChange={handleImageChange} />
            <small>
              Cette image sert de reference visage. Elle sera recadree automatiquement en vertical TikTok.
            </small>
          </label>

          {referencePreviewUrl ? (
            <div className="reference-preview">
              <Image
                alt="Apercu de l'image de reference"
                className="media-fill"
                fill
                sizes="(max-width: 720px) 100vw, 400px"
                src={referencePreviewUrl}
                unoptimized
              />
            </div>
          ) : null}

          {errorMessage ? <p className="error-box">{errorMessage}</p> : null}

          {!envReady ? (
            <div className="notice-box">
              <strong>Avant de lancer le premier rendu</strong>
              <p>Ajoutez votre cle dans un fichier `.env.local` avec `OPENAI_API_KEY=...`, puis relancez le serveur.</p>
            </div>
          ) : null}

          <div className="form-actions">
            <button className="primary-button" disabled={submitting || !envReady} type="submit">
              {submitting ? "Generation du hook en cours..." : "Generer le hook"}
            </button>

            <button
              className="secondary-button"
              disabled={refreshing}
              onClick={() => void refreshDashboard()}
              type="button"
            >
              {refreshing ? "Rafraichissement..." : "Actualiser les statuts"}
            </button>
          </div>
        </form>

        <section className="panel jobs-panel">
          <div className="panel-header">
            <div>
              <h2>Suivi des generations</h2>
              <p>Chaque carte garde la phrase prononcee, la scene, la photo d&apos;entree et le resultat final.</p>
            </div>
            <span className="badge badge-neutral">
              {activeCount > 0 ? `${activeCount} actives` : "Aucune active"}
            </span>
          </div>

          <div className="tips-strip">
            <span>Photo obligatoire</span>
            <span>Texte exact</span>
            <span>Scene separee</span>
            <span>Suivi automatique</span>
            <span>Vertical TikTok</span>
          </div>

          <div className="jobs-list">
            {items.length === 0 ? (
              <div className="empty-state">
                <h3>Pas encore de generation</h3>
                <p>Ajoutez la photo, la phrase et la scene pour lancer votre premier hook.</p>
              </div>
            ) : (
              items.map((item) => (
                <article className="job-card" key={item.id}>
                  <div className="job-header">
                    <div>
                      <p className="job-meta">
                        {modelLabel(item.model)} · {item.seconds}s · {sizeLabel(item.size)}
                      </p>
                      <h3>{statusLabels[item.status]}</h3>
                    </div>
                    <span className={`badge badge-${statusTone(item.status)}`}>{Math.round(item.progressPercent)}%</span>
                  </div>

                  <div className="script-block">
                    <span className="script-label">Ce que la creatrice dit</span>
                    <p className="job-prompt">{item.spokenText ?? item.prompt}</p>
                  </div>

                  <div className="script-block">
                    <span className="script-label">Scene et settings</span>
                    <p className="job-scene">{item.sceneDescription ?? "Generation plus ancienne sans scene separee."}</p>
                  </div>

                  <div className="job-grid">
                    <div className="job-info">
                      <span>Format</span>
                      <strong>{sizeLabel(item.size)}</strong>
                    </div>

                    <div className="job-info">
                      <span>Lance le</span>
                      <strong>{formatDate(item.createdAt)}</strong>
                    </div>

                    <div className="job-info">
                      <span>ID generation</span>
                      <strong className="mono-text">{item.id}</strong>
                    </div>

                    <div className="job-info">
                      <span>Expire cote OpenAI</span>
                      <strong>{item.remoteExpiresAt ? formatDate(item.remoteExpiresAt) : "Non communique"}</strong>
                    </div>
                  </div>

                  <div className="progress-rail">
                    <div className="progress-bar" style={{ width: `${Math.max(item.progressPercent, 8)}%` }} />
                  </div>

                  {item.inputImageUrl ? (
                    <div className="asset-block">
                      <div className="asset-header">
                        <span>Image d&apos;entree</span>
                        <strong>{item.inputImageOriginalName}</strong>
                      </div>
                      <div className="asset-preview image-preview">
                        <Image
                          alt={`Image de reference pour la generation ${item.id}`}
                          className="media-fill"
                          fill
                          sizes="(max-width: 720px) 100vw, 260px"
                          src={item.inputImageUrl}
                          unoptimized
                        />
                      </div>
                    </div>
                  ) : null}

                  {item.videoUrl ? (
                    <div className="asset-block">
                      <div className="asset-header">
                        <span>Resultat video</span>
                        <a href={item.videoUrl} rel="noreferrer" target="_blank">
                          Ouvrir le MP4
                        </a>
                      </div>
                      <video className="video-preview" controls playsInline preload="metadata" src={item.videoUrl} />
                    </div>
                  ) : null}

                  <FollowupAudioPanel
                    elevenLabsReady={elevenLabsReady}
                    item={item}
                    onComplete={() => void refreshDashboard(false)}
                  />

                  {item.errorMessage ? <p className="error-inline">{item.errorMessage}</p> : null}
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
