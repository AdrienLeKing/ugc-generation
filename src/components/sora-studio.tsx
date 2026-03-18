"use client";

import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  DURATION_OPTIONS,
  MAX_BATCH_SIZE,
  MODEL_OPTIONS,
  VERTICAL_SIZE_OPTIONS,
} from "@/lib/sora/config";
import type { GenerationRecord, SoraModel, VerticalSize } from "@/lib/sora/types";

type DashboardResponse = {
  envReady: boolean;
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

export function SoraStudio() {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [envReady, setEnvReady] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(10_000);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<SoraModel>(DEFAULT_MODEL);
  const [seconds, setSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [size, setSize] = useState<VerticalSize>(DEFAULT_SIZE);
  const [count, setCount] = useState(1);
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
      formData.set("prompt", prompt);
      formData.set("model", model);
      formData.set("seconds", String(seconds));
      formData.set("size", size);
      formData.set("count", String(count));

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
          <span className="eyebrow">Sora 2 local studio</span>
          <h1>Generations video verticales, texte seul ou texte plus image, avec suivi local.</h1>
          <p>
            Tout est pense pour du 9:16. Vous choisissez la duree, le niveau de detail vertical, le prompt,
            l&apos;image de reference si besoin, puis vous suivez chaque rendu sans quitter la page.
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
        </div>
      </section>

      <section className="studio-grid">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <div className="panel-header">
            <div>
              <h2>Lancer une generation</h2>
              <p>Le format reste toujours vertical, version TikTok.</p>
            </div>
            <span className={`badge ${envReady ? "badge-success" : "badge-danger"}`}>
              {envReady ? "Cle API detectee" : "Cle API manquante"}
            </span>
          </div>

          <label className="field">
            <span>Prompt principal</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              placeholder="Exemple: Une influenceuse dans une cuisine lumineuse, plan serre smartphone, ambiance naturelle, camera epaule tres legere, style UGC premium."
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

          <div className="field-grid">
            <label className="field">
              <span>Format vertical</span>
              <select value={size} onChange={(event) => setSize(event.target.value as VerticalSize)}>
                {VERTICAL_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>{VERTICAL_SIZE_OPTIONS.find((option) => option.value === size)?.description}</small>
            </label>

            <label className="field">
              <span>Nombre de generations</span>
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {Array.from({ length: MAX_BATCH_SIZE }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Image de reference optionnelle</span>
            <input accept="image/*" type="file" onChange={handleImageChange} />
            <small>
              Si vous ajoutez une image, elle sera recadree automatiquement en vertical pour correspondre au format
              video choisi.
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
              {submitting ? "Generation en cours d'envoi..." : "Lancer la generation"}
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
              <p>Chaque carte garde le prompt, l&apos;entree et le resultat final une fois telecharge localement.</p>
            </div>
            <span className="badge badge-neutral">
              {activeCount > 0 ? `${activeCount} actives` : "Aucune active"}
            </span>
          </div>

          <div className="tips-strip">
            <span>9:16 uniquement</span>
            <span>Texte seul ou texte + image</span>
            <span>Suivi automatique</span>
            <span>Sortie MP4 locale</span>
          </div>

          <div className="jobs-list">
            {items.length === 0 ? (
              <div className="empty-state">
                <h3>Pas encore de generation</h3>
                <p>Lancez votre premier prompt pour commencer a construire votre historique local.</p>
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

                  <p className="job-prompt">{item.prompt}</p>

                  <div className="job-grid">
                    <div className="job-info">
                      <span>Mode d&apos;entree</span>
                      <strong>{item.inputMode === "text_plus_image" ? "Texte + image" : "Texte seul"}</strong>
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
