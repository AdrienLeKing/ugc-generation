"use client";

import { useState } from "react";

import { useT } from "@/lib/i18n/context";
import type { DemoAsset, GenerationRecord } from "@/lib/sora/types";

type MediaSection = "hooks" | "demos" | "rendus";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatDuration(seconds: number | undefined, unknownLabel: string) {
  if (!seconds || !Number.isFinite(seconds)) {
    return unknownLabel;
  }

  return `${Math.round(seconds)} s`;
}

export function MediaView({
  items,
  demos,
  onRefreshDemos,
  loadingDemos,
}: {
  items: GenerationRecord[];
  demos: DemoAsset[];
  onRefreshDemos: () => void;
  loadingDemos: boolean;
}) {
  const t = useT();
  const [section, setSection] = useState<MediaSection>("hooks");

  const completedHooks = items.filter(
    (item) => item.status === "completed" && item.videoUrl,
  );
  const finalRendus = items.filter(
    (item) => item.finalVideoUrl,
  );

  return (
    <section className="panel tab-view-panel">
      <div className="panel-header">
        <div>
          <h2>{t.media.title}</h2>
          <p>{t.media.subtitle}</p>
        </div>
      </div>

      <div className="media-section-tabs">
        <button
          className={`media-section-tab ${section === "hooks" ? "is-active" : ""}`}
          onClick={() => setSection("hooks")}
          type="button"
        >
          {t.media.hooksTab(completedHooks.length)}
        </button>
        <button
          className={`media-section-tab ${section === "demos" ? "is-active" : ""}`}
          onClick={() => setSection("demos")}
          type="button"
        >
          {t.media.demosTab(demos.length)}
        </button>
        <button
          className={`media-section-tab ${section === "rendus" ? "is-active" : ""}`}
          onClick={() => setSection("rendus")}
          type="button"
        >
          {t.media.rendersTab(finalRendus.length)}
        </button>
      </div>

      {section === "hooks" ? (
        <div className="media-grid">
          {completedHooks.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>{t.media.noCompletedHooks}</h3>
              <p>{t.media.noCompletedHooksDesc}</p>
            </div>
          ) : (
            completedHooks.map((item) => (
              <article className="media-card" key={item.id}>
                {item.videoUrl ? (
                  <video
                    className="media-card-video"
                    controls
                    playsInline
                    preload="metadata"
                    src={item.videoUrl}
                  />
                ) : null}
                <div className="media-card-body">
                  <strong>{item.spokenText || item.prompt}</strong>
                  <small>
                    {item.model} · {item.seconds}s · {formatDate(item.createdAt)}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {section === "demos" ? (
        <div className="media-grid">
          <div className="media-section-header">
            <button
              className="secondary-button compact-button"
              disabled={loadingDemos}
              onClick={onRefreshDemos}
              type="button"
            >
              {loadingDemos ? t.common.loading : t.common.refresh}
            </button>
          </div>
          {demos.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>{t.media.noDemos}</h3>
              <p>{t.media.noDemosDesc}</p>
            </div>
          ) : (
            demos.map((demo) => (
              <article className="media-card" key={demo.id}>
                <video
                  className="media-card-video"
                  controls
                  playsInline
                  preload="metadata"
                  src={demo.videoUrl}
                />
                <div className="media-card-body">
                  <strong>{demo.name}</strong>
                  <small>{formatDuration(demo.durationSeconds, t.common.unknownDuration)}</small>
                  <p className="media-card-script">{demo.defaultScript}</p>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {section === "rendus" ? (
        <div className="media-grid">
          {finalRendus.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>{t.media.noFinalRenders}</h3>
              <p>{t.media.noFinalRendersDesc}</p>
            </div>
          ) : (
            finalRendus.map((item) => (
              <article className="media-card" key={item.id}>
                {item.finalVideoUrl ? (
                  <video
                    className="media-card-video"
                    controls
                    playsInline
                    preload="metadata"
                    src={item.finalVideoUrl}
                  />
                ) : null}
                <div className="media-card-body">
                  <strong>{item.spokenText || item.prompt}</strong>
                  <small>
                    {item.voiceoverScript
                      ? `Script: ${item.voiceoverScript.slice(0, 60)}...`
                      : formatDate(item.createdAt)}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
