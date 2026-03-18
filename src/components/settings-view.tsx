"use client";

import { useT } from "@/lib/i18n/context";
import { LocaleSwitcher } from "./locale-switcher";

export function SettingsView({
  envReady,
  elevenLabsReady,
  userEmail,
  onLogout,
}: {
  envReady: boolean;
  elevenLabsReady: boolean;
  userEmail: string | null;
  onLogout: () => void;
}) {
  const t = useT();

  return (
    <section className="panel tab-view-panel">
      <div className="panel-header">
        <div>
          <h2>{t.settings.title}</h2>
          <p>{t.settings.subtitle}</p>
        </div>
      </div>

      {userEmail ? (
        <article className="settings-card settings-account-card">
          <div className="settings-card-head">
            <strong>{t.settings.account}</strong>
            <span className="badge badge-success">{t.settings.connected}</span>
          </div>
          <p className="settings-account-email">{userEmail}</p>
          <div className="settings-card-actions">
            <button className="secondary-button compact-button" onClick={onLogout} type="button">
              {t.settings.logout}
            </button>
          </div>
        </article>
      ) : (
        <article className="settings-card is-missing">
          <div className="settings-card-head">
            <strong>{t.settings.account}</strong>
            <span className="badge badge-neutral">{t.settings.notConnected}</span>
          </div>
          <p>{t.settings.anonymousMode}</p>
          <div className="settings-card-actions">
            <a className="primary-button compact-button" href="/login">
              {t.settings.login}
            </a>
          </div>
        </article>
      )}

      <h3 className="settings-section-title">{t.settings.services}</h3>

      <div className="settings-grid">
        <article className={`settings-card ${envReady ? "is-ok" : "is-missing"}`}>
          <div className="settings-card-head">
            <strong>OpenAI (Sora)</strong>
            <span className={`badge badge-${envReady ? "success" : "danger"}`}>
              {envReady ? t.settings.connected : t.settings.notConfigured}
            </span>
          </div>
          <p>
            {envReady
              ? t.settings.openaiReady
              : t.settings.openaiMissing}
          </p>
        </article>

        <article className={`settings-card ${elevenLabsReady ? "is-ok" : "is-missing"}`}>
          <div className="settings-card-head">
            <strong>ElevenLabs</strong>
            <span className={`badge badge-${elevenLabsReady ? "success" : "danger"}`}>
              {elevenLabsReady ? t.settings.connected : t.settings.notConfigured}
            </span>
          </div>
          <p>
            {elevenLabsReady
              ? t.settings.elevenLabsReady
              : t.settings.elevenLabsMissing}
          </p>
        </article>

        <article className="settings-card is-ok">
          <div className="settings-card-head">
            <strong>Supabase</strong>
            <span className="badge badge-success">{t.settings.connected}</span>
          </div>
          <p>{t.settings.supabaseDesc}</p>
        </article>
      </div>

      <h3 className="settings-section-title">Langue / Language</h3>
      <LocaleSwitcher />
    </section>
  );
}
