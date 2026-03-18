"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { useT } from "@/lib/i18n/context";
import type { Persona } from "@/lib/sora/types";

type ApiError = {
  error?: string;
};

type PersonaItemResponse = {
  item: Persona;
};

function isApiError(payload: unknown): payload is ApiError {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

export function PersonaView({
  personas,
  onPersonaCreated,
}: {
  personas: Persona[];
  onPersonaCreated: () => void;
}) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const formData = new FormData(event.currentTarget);

      const response = await fetch("/api/personas", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as PersonaItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(
          isApiError(payload)
            ? payload.error ?? t.studio.personaCreateFailed
            : t.studio.personaCreateFailed,
        );
      }

      setNewName("");
      setNewNotes("");
      formRef.current?.reset();
      onPersonaCreated();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t.studio.personaCreateFailed);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="panel tab-view-panel">
      <div className="panel-header">
        <div>
          <h2>{t.studio.personas}</h2>
          <p>{t.studio.personaLibrary}</p>
        </div>
        <span className="badge badge-neutral">{t.studio.personaCount(personas.length)}</span>
      </div>

      <div className="persona-view-grid">
        <div className="persona-library">
          {personas.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>{t.studio.noPersonas}</h3>
              <p>{t.studio.noPersonasDesc}</p>
            </div>
          ) : (
            <div className="persona-grid persona-grid-large">
              {personas.map((persona) => (
                <article className="persona-card" key={persona.id}>
                  <div className="persona-photo">
                    <Image
                      alt={persona.name}
                      className="media-fill"
                      fill
                      sizes="180px"
                      src={persona.photoUrl}
                      unoptimized
                    />
                  </div>
                  <strong>{persona.name}</strong>
                  {persona.notes ? <small>{persona.notes}</small> : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="persona-create-panel">
          <h3>{t.studio.addPersona}</h3>
          <form className="wizard-form compact-form" onSubmit={handleCreate} ref={formRef}>
            <label className="field">
              <span>{t.studio.personaName}</span>
              <input
                name="name"
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t.studio.personaNamePlaceholder}
                required
                type="text"
                value={newName}
              />
            </label>

            <label className="field">
              <span>{t.studio.personaPhoto}</span>
              <input accept="image/*" name="photo" required type="file" />
              <small>{t.studio.personaPhotoCrop}</small>
            </label>

            <label className="field">
              <span>{t.studio.personaNotes}</span>
              <textarea
                name="notes"
                onChange={(event) => setNewNotes(event.target.value)}
                placeholder={t.studio.personaNotesPlaceholder}
                rows={3}
                value={newNotes}
              />
            </label>

            {createError ? <p className="error-inline">{createError}</p> : null}

            <div className="form-actions">
              <button className="primary-button" disabled={creating} type="submit">
                {creating ? t.common.creating : t.studio.createPersona}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
