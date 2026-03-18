"use client";

import Image from "next/image";
import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DURATION_OPTIONS,
  MODEL_OPTIONS,
} from "@/lib/sora/config";
import {
  DEFAULT_HOOK_PRESET_ID,
  HOOK_PRESETS,
  getHookPreset,
  isCustomHookPreset,
  type HookPresetId,
} from "@/lib/sora/hook-presets";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { DemoAsset, GenerationRecord, SoraModel } from "@/lib/sora/types";

type DashboardResponse = {
  envReady: boolean;
  elevenLabsReady: boolean;
  pollIntervalMs: number;
  items: GenerationRecord[];
  backendError?: string;
  user?: { email?: string } | null;
};

type DemoLibraryResponse = {
  items: DemoAsset[];
};

type CreateGenerationResponse = {
  items: GenerationRecord[];
};

type ItemResponse = {
  item: GenerationRecord;
};

type DemoItemResponse = {
  item: DemoAsset;
};

type ApiError = {
  error?: string;
};

type WizardStep = 1 | 2 | 3;

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) {
    return "Duree inconnue";
  }

  return `${Math.round(seconds)} s`;
}

function isApiError(payload: unknown): payload is ApiError {
  return typeof payload === "object" && payload !== null && "error" in payload;
}

function requestError(payload: ApiError | undefined, fallback: string) {
  return payload?.error || fallback;
}

async function requestDashboard() {
  const response = await fetch("/api/generations", {
    cache: "no-store",
  });

  const payload = (await response.json()) as DashboardResponse | ApiError;

  if (!response.ok || isApiError(payload)) {
    throw new Error(requestError(isApiError(payload) ? payload : undefined, "Impossible de recuperer les hooks."));
  }

  return payload;
}

async function requestDemoLibrary() {
  const response = await fetch("/api/demos", {
    cache: "no-store",
  });

  const payload = (await response.json()) as DemoLibraryResponse | ApiError;

  if (!response.ok || isApiError(payload)) {
    throw new Error(
      requestError(
        isApiError(payload) ? payload : undefined,
        "Impossible de recuperer la bibliotheque de demos.",
      ),
    );
  }

  return payload.items;
}

const stepTitles: Array<{ step: WizardStep; title: string; caption: string }> = [
  {
    step: 1,
    title: "Hook",
    caption: "Generer le hook Sora",
  },
  {
    step: 2,
    title: "Validation",
    caption: "Choisir et valider un hook",
  },
  {
    step: 3,
    title: "Demo finale",
    caption: "Voix clonee, script, MP4 final",
  },
];

const hookStatusLabels: Record<GenerationRecord["status"], string> = {
  queued: "En file",
  in_progress: "En cours",
  completed: "Termine",
  failed: "Echec",
  unknown: "Etat inconnu",
};

const asyncStatusLabels: Record<GenerationRecord["voiceCloneStatus"], string> = {
  idle: "En attente",
  processing: "En cours",
  ready: "Pret",
  failed: "Echec",
};

const approvalLabels: Record<GenerationRecord["approvalStatus"], string> = {
  draft: "A valider",
  approved: "Valide",
  rejected: "Rejete",
};

function modelLabel(model: SoraModel) {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}

function approvalTone(status: GenerationRecord["approvalStatus"]) {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

function asyncTone(status: GenerationRecord["voiceCloneStatus"] | GenerationRecord["finalVideoStatus"]) {
  switch (status) {
    case "ready":
      return "success";
    case "failed":
      return "danger";
    case "processing":
      return "accent";
    default:
      return "neutral";
  }
}

function generationTone(status: GenerationRecord["status"]) {
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

function findResumeHookId(items: GenerationRecord[], currentId: string | null) {
  if (currentId && items.some((item) => item.id === currentId)) {
    return currentId;
  }

  const latestApproved = items.find((item) => item.approvalStatus === "approved");
  return latestApproved?.id ?? null;
}

function stepForHook(item?: GenerationRecord | null): WizardStep {
  if (!item) {
    return 1;
  }

  if (item.approvalStatus === "approved" && item.voiceCloneStatus === "ready") {
    return 3;
  }

  if (item.status === "completed") {
    return 2;
  }

  return 1;
}

function isStep3Unlocked(item?: GenerationRecord | null) {
  return Boolean(item && item.approvalStatus === "approved" && item.voiceCloneStatus === "ready");
}

function copyForHookCard(item: GenerationRecord) {
  return item.spokenText ?? item.prompt;
}

export function SoraStudio() {
  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [demos, setDemos] = useState<DemoAsset[]>([]);
  const [envReady, setEnvReady] = useState(false);
  const [elevenLabsReady, setElevenLabsReady] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(10_000);
  const [selectedStep, setSelectedStep] = useState<WizardStep>(1);
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [hookPresetId, setHookPresetId] = useState<HookPresetId>(DEFAULT_HOOK_PRESET_ID);
  const [spokenText, setSpokenText] = useState("");
  const [sceneDescription, setSceneDescription] = useState(getHookPreset(DEFAULT_HOOK_PRESET_ID).sceneStarter);
  const [model, setModel] = useState<SoraModel>(DEFAULT_MODEL);
  const [seconds, setSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [demosError, setDemosError] = useState<string | null>(null);
  const [createDemoError, setCreateDemoError] = useState<string | null>(null);
  const [editDemoError, setEditDemoError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [submittingHook, setSubmittingHook] = useState(false);
  const [pendingHookPreview, setPendingHookPreview] = useState<GenerationRecord | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingDemos, setLoadingDemos] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [approveBusyId, setApproveBusyId] = useState<string | null>(null);
  const [finalizingHookId, setFinalizingHookId] = useState<string | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState("");
  const [demoScript, setDemoScript] = useState("");
  const [demoScriptDirty, setDemoScriptDirty] = useState(false);
  const [newDemoName, setNewDemoName] = useState("");
  const [newDemoDefaultScript, setNewDemoDefaultScript] = useState("");
  const [editingDemoId, setEditingDemoId] = useState<string | null>(null);
  const [editingDemoName, setEditingDemoName] = useState("");
  const [editingDemoDefaultScript, setEditingDemoDefaultScript] = useState("");
  const [savingDemoEdit, setSavingDemoEdit] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const createDemoFormRef = useRef<HTMLFormElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  const selectedHook = items.find((item) => item.id === selectedHookId) ?? null;
  const selectedPreset = getHookPreset(hookPresetId);
  const isCustomPreset = isCustomHookPreset(hookPresetId);
  const hasSelectedHook = Boolean(selectedHook);
  const persistedSelectedDemoId = selectedHook?.selectedDemoId ?? "";
  const persistedDemoScript = selectedHook?.demoScriptDraft ?? "";
  const selectedDemo = demos.find((demo) => demo.id === selectedDemoId) ?? null;
  const activeCount = items.filter((item) => item.status === "queued" || item.status === "in_progress").length;
  const completedHooks = items.filter((item) => item.status === "completed");
  const readyStep3 = isStep3Unlocked(selectedHook);
  const historyItems = pendingHookPreview ? [pendingHookPreview, ...items] : items;

  async function handleLogout() {
    await getBrowserSupabase().auth.signOut();
    window.location.href = "/login";
  }

  function applyDashboardPayload(payload: DashboardResponse) {
    startTransition(() => {
      setItems(payload.items);
      setEnvReady(payload.envReady);
      setElevenLabsReady(payload.elevenLabsReady);
      setPollIntervalMs(payload.pollIntervalMs);
      setSelectedHookId((currentId) => findResumeHookId(payload.items, currentId));
    });

    if (payload.user?.email) {
      setUserEmail(payload.user.email);
    }

    setDashboardError(payload.backendError ?? null);
  }

  async function refreshDashboard(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const payload = await requestDashboard();
      applyDashboardPayload(payload);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "Impossible de recuperer les hooks.");
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
      setDashboardError(error instanceof Error ? error.message : "Impossible de recuperer les hooks.");
    } finally {
      setRefreshing(false);
    }
  });

  async function refreshDemoLibrary(showSpinner = true) {
    if (showSpinner) {
      setLoadingDemos(true);
    }

    try {
      const nextDemos = await requestDemoLibrary();
      setDemos(nextDemos);
      setDemosError(null);
    } catch (error) {
      setDemosError(
        error instanceof Error ? error.message : "Impossible de recuperer la bibliotheque de demos.",
      );
    } finally {
      setLoadingDemos(false);
    }
  }

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

  useEffect(() => {
    if (!hasSelectedHook) {
      setSelectedDemoId("");
      setDemoScript("");
      setDemoScriptDirty(false);
      setFinalizeError(null);
      return;
    }

    setSelectedDemoId(persistedSelectedDemoId);
    setDemoScript(persistedDemoScript);
    setDemoScriptDirty(false);
    setFinalizeError(null);
  }, [hasSelectedHook, persistedSelectedDemoId, persistedDemoScript]);

  useEffect(() => {
    if (!selectedDemo) {
      return;
    }

    if (selectedHook?.selectedDemoId === selectedDemo.id && selectedHook.demoScriptDraft) {
      if (!demoScriptDirty && demoScript !== selectedHook.demoScriptDraft) {
        setDemoScript(selectedHook.demoScriptDraft);
      }
      return;
    }

    if (!demoScriptDirty && !demoScript) {
      setDemoScript(selectedDemo.defaultScript);
    }
  }, [
    selectedDemo,
    selectedHook?.selectedDemoId,
    selectedHook?.demoScriptDraft,
    demoScriptDirty,
    demoScript,
  ]);

  useEffect(() => {
    if (selectedStep !== 3 || !readyStep3) {
      return;
    }

    void refreshDemoLibrary(false);
  }, [selectedStep, readyStep3]);

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

  function handlePresetSelect(nextPresetId: HookPresetId) {
    const previousPreset = getHookPreset(hookPresetId);
    const nextPreset = getHookPreset(nextPresetId);

    setHookPresetId(nextPresetId);

    if (isCustomHookPreset(nextPresetId)) {
      if (!sceneDescription.trim() || sceneDescription === previousPreset.sceneStarter) {
        setSceneDescription("");
      }
      return;
    }

    if (!sceneDescription.trim() || sceneDescription === previousPreset.sceneStarter || isCustomHookPreset(hookPresetId)) {
      setSceneDescription(nextPreset.sceneStarter);
    }
  }

  function focusHook(item: GenerationRecord) {
    setSelectedHookId(item.id);
  }

  function openHookInValidation(item: GenerationRecord) {
    setSelectedHookId(item.id);
    setSelectedStep(2);
  }

  function buildPendingHookPreview(input: { spokenText: string; sceneDescription: string }) {
    const now = new Date().toISOString();

    return {
      id: `pending-${now}`,
      prompt: input.spokenText,
      spokenText: input.spokenText,
      sceneDescription: input.sceneDescription,
      model,
      seconds,
      size: "720x1280",
      status: "in_progress" as const,
      progressPercent: 8,
      inputMode: referenceImage ? "text_plus_image" as const : "text" as const,
      inputImageUrl: undefined,
      inputImageOriginalName: referenceImage?.name,
      inputImageWidth: undefined,
      inputImageHeight: undefined,
      approvalStatus: "draft" as const,
      approvedAt: undefined,
      voiceCloneStatus: "idle" as const,
      hookAudioUrl: undefined,
      hookAudioFileName: undefined,
      elevenlabsVoiceId: undefined,
      elevenlabsVoiceName: undefined,
      selectedDemoId: undefined,
      demoScriptDraft: undefined,
      voiceoverUrl: undefined,
      voiceoverFileName: undefined,
      voiceoverScript: undefined,
      finalVideoStatus: "idle" as const,
      finalVideoUrl: undefined,
      finalVideoFileName: undefined,
      videoUrl: undefined,
      videoFileName: undefined,
      errorMessage: undefined,
      createdAt: now,
      updatedAt: now,
      remoteCreatedAt: undefined,
      remoteCompletedAt: undefined,
      remoteExpiresAt: undefined,
      sourceVideoId: undefined,
      editPrompt: undefined,
    } satisfies GenerationRecord;
  }

  async function handleHookSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingHook(true);
    setDashboardError(null);

    try {
      const formData = new FormData();
      const resolvedSceneDescription = isCustomPreset ? sceneDescription : selectedPreset.sceneStarter;
      const optimisticHook = buildPendingHookPreview({
        spokenText,
        sceneDescription: resolvedSceneDescription,
      });

      setPendingHookPreview(optimisticHook);

      formData.set("hookPresetId", hookPresetId);
      formData.set("spokenText", spokenText);
      formData.set("sceneDescription", resolvedSceneDescription);
      formData.set("model", model);
      formData.set("seconds", String(seconds));

      if (referenceImage) {
        formData.set("referenceImage", referenceImage);
      }

      const response = await fetch("/api/generations", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as CreateGenerationResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(requestError(isApiError(payload) ? payload : undefined, "La generation du hook a echoue."));
      }

      const createdId = payload.items[0]?.id;
      if (createdId) {
        setSelectedHookId(createdId);
      }

      setPendingHookPreview(null);
      if (payload.items.length > 0) {
        setItems((current) => {
          const next = [...payload.items, ...current.filter((item) => !payload.items.some((created) => created.id === item.id))];
          return next;
        });
      }

      setSelectedStep(1);
      setHookPresetId(DEFAULT_HOOK_PRESET_ID);
      setSpokenText("");
      setSceneDescription(getHookPreset(DEFAULT_HOOK_PRESET_ID).sceneStarter);
      setReferenceImage(null);
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
      setReferencePreviewUrl(null);
      event.currentTarget.reset();

      await refreshDashboard(false);
    } catch (error) {
      setPendingHookPreview(null);
      setDashboardError(error instanceof Error ? error.message : "La generation du hook a echoue.");
    } finally {
      setSubmittingHook(false);
    }
  }

  async function handleApproveHook(item: GenerationRecord) {
    setApproveBusyId(item.id);
    setDashboardError(null);
    setSelectedHookId(item.id);

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              approvalStatus: "approved",
              voiceCloneStatus: "processing",
              errorMessage: undefined,
            }
          : currentItem,
      ),
    );

    try {
      const response = await fetch(`/api/generations/${item.id}/approve`, {
        method: "POST",
      });

      const payload = (await response.json()) as ItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(requestError(isApiError(payload) ? payload : undefined, "La validation du hook a echoue."));
      }

      setSelectedHookId(payload.item.id);
      setSelectedStep(stepForHook(payload.item));
      await refreshDashboard(false);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : "La validation du hook a echoue.");
      await refreshDashboard(false);
    } finally {
      setApproveBusyId(null);
    }
  }

  async function handleFinalizeDemo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedHook) {
      return;
    }

    setFinalizingHookId(selectedHook.id);
    setFinalizeError(null);

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === selectedHook.id
          ? {
              ...currentItem,
              selectedDemoId,
              demoScriptDraft: demoScript,
              finalVideoStatus: "processing",
              errorMessage: undefined,
            }
          : currentItem,
      ),
    );

    try {
      const response = await fetch(`/api/generations/${selectedHook.id}/finalize-demo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          demoId: selectedDemoId,
          scriptText: demoScript.trim(),
        }),
      });

      const payload = (await response.json()) as ItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(requestError(isApiError(payload) ? payload : undefined, "Le rendu final a echoue."));
      }

      await refreshDashboard(false);
    } catch (error) {
      setFinalizeError(error instanceof Error ? error.message : "Le rendu final a echoue.");
      await refreshDashboard(false);
    } finally {
      setFinalizingHookId(null);
    }
  }

  async function handleCreateDemo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingDemo(true);
    setCreateDemoError(null);

    try {
      const formData = new FormData(event.currentTarget);

      const response = await fetch("/api/demos", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as DemoItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(requestError(isApiError(payload) ? payload : undefined, "La creation de la demo a echoue."));
      }

      await refreshDemoLibrary(false);
      setSelectedDemoId(payload.item.id);
      setDemoScript(payload.item.defaultScript);
      setDemoScriptDirty(false);
      setNewDemoName("");
      setNewDemoDefaultScript("");
      createDemoFormRef.current?.reset();
    } catch (error) {
      setCreateDemoError(error instanceof Error ? error.message : "La creation de la demo a echoue.");
    } finally {
      setCreatingDemo(false);
    }
  }

  function startEditingDemo(demo: DemoAsset) {
    setEditingDemoId(demo.id);
    setEditingDemoName(demo.name);
    setEditingDemoDefaultScript(demo.defaultScript);
    setEditDemoError(null);
  }

  async function handleSaveDemoEdit(demo: DemoAsset) {
    setSavingDemoEdit(true);
    setEditDemoError(null);

    try {
      const response = await fetch(`/api/demos/${demo.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editingDemoName,
          defaultScript: editingDemoDefaultScript,
        }),
      });

      const payload = (await response.json()) as DemoItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(
          requestError(isApiError(payload) ? payload : undefined, "La mise a jour de la demo a echoue."),
        );
      }

      const previousDefaultScript = demo.defaultScript;
      await refreshDemoLibrary(false);

      if (
        selectedDemoId === demo.id &&
        (!demoScriptDirty || demoScript === previousDefaultScript)
      ) {
        setDemoScript(payload.item.defaultScript);
        setDemoScriptDirty(false);
      }

      setEditingDemoId(null);
    } catch (error) {
      setEditDemoError(error instanceof Error ? error.message : "La mise a jour de la demo a echoue.");
    } finally {
      setSavingDemoEdit(false);
    }
  }

  function handlePickDemo(demo: DemoAsset) {
    setSelectedDemoId(demo.id);
    if (selectedHook?.selectedDemoId === demo.id && selectedHook.demoScriptDraft) {
      setDemoScript(selectedHook.demoScriptDraft);
    } else {
      setDemoScript(demo.defaultScript);
    }
    setDemoScriptDirty(false);
  }

  const canSubmitFinalDemo =
    Boolean(selectedHook) &&
    readyStep3 &&
    Boolean(selectedDemoId) &&
    Boolean(demoScript.trim()) &&
    !finalizingHookId &&
    elevenLabsReady;

  return (
    <main className="page-shell">
      <div className="page-backdrop" />

      {userEmail ? (
        <div className="user-bar">
          <span className="user-email">{userEmail}</span>
          <button className="logout-button" onClick={handleLogout} type="button">
            Deconnexion
          </button>
        </div>
      ) : null}
      <header className="app-header">
        <h1>Bulk UGC</h1>
      </header>

      <section className="wizard-shell">
        <div className="wizard-main">
          <section className="panel stepper-panel">
            <div className="panel-header">
              <div>
                <h2>Flux guide</h2>
                <p>Crée, choisis puis transforme un hook en démo finale.</p>
              </div>
            </div>

            <div className="stepper-track">
              {stepTitles.map((step) => {
                const active = selectedStep === step.step;
                const reached = selectedStep > step.step || active;

                return (
                  <button
                    className={`step-card ${active ? "is-active" : ""}`}
                    key={step.step}
                    onClick={() => setSelectedStep(step.step)}
                    type="button"
                  >
                    <span className={`step-index ${reached ? "is-reached" : ""}`}>{step.step}</span>
                    <strong>{step.title}</strong>
                    <small>{step.caption}</small>
                  </button>
                );
              })}
            </div>
          </section>

          {dashboardError ? <p className="error-box">{dashboardError}</p> : null}

          {selectedStep === 1 ? (
            <section className="panel step-panel">
              <div className="panel-header">
                <div>
                  <h2>Etape 1 — Hook Sora</h2>
                  <p>Image, texte prononce, scene et settings, puis generation du hook vertical.</p>
                </div>
                <span className="badge badge-neutral">Défaut: 4 secondes</span>
              </div>

              <form className="wizard-form" onSubmit={handleHookSubmit}>
                <div className="field">
                  <span>Preset de tournage UGC</span>
                  <div className="preset-grid">
                    {HOOK_PRESETS.map((preset) => {
                      const isActive = preset.id === hookPresetId;

                      return (
                        <button
                          className={`preset-card ${isActive ? "is-active" : ""}`}
                          key={preset.id}
                          onClick={() => handlePresetSelect(preset.id)}
                          title={`${preset.summary} ${preset.shootingContext}`}
                          type="button"
                        >
                          <div className="preset-card-head">
                            <strong>{preset.name}</strong>
                            <span className="badge badge-neutral">{preset.badge}</span>
                          </div>
                          <div className="preset-tooltip" role="presentation">
                            <p>{preset.summary}</p>
                            <small>{preset.shootingContext}</small>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="field">
                  <span>Texte prononcé</span>
                  <textarea
                    onChange={(event) => setSpokenText(event.target.value)}
                    placeholder='Exemple: "Stop, si ta peau tiraille apres la douche, il faut voir ca."'
                    required
                    rows={5}
                    value={spokenText}
                  />
                </label>

                {isCustomPreset ? (
                  <label className="field">
                    <span>Preset custom</span>
                    <textarea
                      onChange={(event) => setSceneDescription(event.target.value)}
                      placeholder="Decris ici la scene, le contexte, le rythme, le lieu, la lumiere et les details de tournage."
                      required
                      rows={4}
                      value={sceneDescription}
                    />
                    <small>Ce champ n&apos;apparait que pour le preset custom.</small>
                  </label>
                ) : null}

                <div className="field-grid">
                  <label className="field">
                    <span>Modèle</span>
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
                    <span>Durée</span>
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
                  <input accept="image/*" onChange={handleImageChange} type="file" />
                  <small>Optionnel: si tu ajoutes une photo, elle sert d&apos;ancrage visuel et sera recadrée en 9:16 avant envoi à Sora.</small>
                </label>

                {referencePreviewUrl ? (
                  <div className="reference-preview">
                    <Image
                      alt="Apercu de l'image de reference"
                      className="media-fill"
                      fill
                      sizes="(max-width: 720px) 100vw, 440px"
                      src={referencePreviewUrl}
                      unoptimized
                    />
                  </div>
                ) : null}

                {!envReady ? (
                  <div className="notice-box">
                    <strong>OpenAI n&apos;est pas configure</strong>
                    <p>Ajoutez `OPENAI_API_KEY` dans `.env.local` pour lancer un hook.</p>
                  </div>
                ) : null}

                <div className="form-actions">
                  <button className="primary-button" disabled={submittingHook || !envReady} type="submit">
                    {submittingHook ? "Generation du hook..." : "Generer le hook"}
                  </button>
                </div>

                <p className="creation-counter">
                  {activeCount > 0
                    ? `${activeCount} création${activeCount > 1 ? "s" : ""} en cours`
                    : "Aucune création en cours"}
                </p>
              </form>
            </section>
          ) : null}

          {selectedStep === 2 ? (
            <section className="panel step-panel">
              <div className="panel-header">
                <div>
                  <h2>Etape 2 — Validation</h2>
                  <p>Choisissez un hook termine, puis activez son usage pour la demo finale.</p>
                </div>
                <span className={`badge badge-${selectedHook ? approvalTone(selectedHook.approvalStatus) : "neutral"}`}>
                  {selectedHook ? approvalLabels[selectedHook.approvalStatus] : "Aucun hook selectionne"}
                </span>
              </div>

              {!elevenLabsReady ? (
                <div className="notice-box">
                  <strong>ElevenLabs n&apos;est pas configure</strong>
                  <p>Ajoutez `ELEVENLABS_API_KEY` dans `.env.local` pour cloner la voix apres validation.</p>
                </div>
              ) : null}

              {selectedHook ? (
                <article className="selected-hook-panel">
                  <div className="selected-hook-copy">
                    <span className="eyebrow">Hook actif</span>
                    <h3>{copyForHookCard(selectedHook)}</h3>
                    <p>{selectedHook.sceneDescription ?? "Pas de description de scene."}</p>
                  </div>

                  <div className="selected-hook-meta">
                    <div className="mini-stat">
                      <span>Statut hook</span>
                      <strong>{hookStatusLabels[selectedHook.status]}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Validation</span>
                      <strong>{approvalLabels[selectedHook.approvalStatus]}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Voix clonee</span>
                      <strong>{asyncStatusLabels[selectedHook.voiceCloneStatus]}</strong>
                    </div>
                  </div>

                  {selectedHook.videoUrl ? (
                    <video
                      className="video-preview compact-video"
                      controls
                      playsInline
                      preload="metadata"
                      src={selectedHook.videoUrl}
                    />
                  ) : null}

                  <div className="selected-hook-actions">
                    {selectedHook.approvalStatus === "approved" && selectedHook.voiceCloneStatus === "ready" ? (
                      <button className="primary-button" onClick={() => setSelectedStep(3)} type="button">
                        Passer a la demo finale
                      </button>
                    ) : null}

                    {selectedHook.status === "completed" && selectedHook.approvalStatus !== "approved" ? (
                      <button
                        className="primary-button"
                        disabled={!elevenLabsReady || approveBusyId === selectedHook.id}
                        onClick={() => void handleApproveHook(selectedHook)}
                        type="button"
                      >
                        {approveBusyId === selectedHook.id ? "Validation en cours..." : "Utiliser ce hook"}
                      </button>
                    ) : null}

                    {selectedHook.approvalStatus === "approved" && selectedHook.voiceCloneStatus === "failed" ? (
                      <button
                        className="secondary-button"
                        disabled={!elevenLabsReady || approveBusyId === selectedHook.id}
                        onClick={() => void handleApproveHook(selectedHook)}
                        type="button"
                      >
                        {approveBusyId === selectedHook.id ? "Relance..." : "Relancer la creation de voix"}
                      </button>
                    ) : null}
                  </div>

                  {selectedHook.errorMessage ? <p className="error-inline">{selectedHook.errorMessage}</p> : null}
                </article>
              ) : (
                <div className="empty-state compact-empty">
                  <h3>Aucun hook selectionne</h3>
                  <p>Choisissez un hook termine depuis l&apos;historique ou depuis la liste ci-dessous.</p>
                </div>
              )}

              <div className="hook-catalog">
                {completedHooks.length === 0 ? (
                  <div className="empty-state compact-empty">
                    <h3>Aucun hook termine</h3>
                    <p>Generez d&apos;abord un hook dans l&apos;etape 1.</p>
                  </div>
                ) : (
                  completedHooks.map((item) => (
                    <article
                      className={`hook-card ${selectedHookId === item.id ? "is-selected" : ""}`}
                      key={item.id}
                    >
                      <div className="hook-card-head">
                        <div>
                          <span className="eyebrow">{modelLabel(item.model)} · {item.seconds}s</span>
                          <h3>{copyForHookCard(item)}</h3>
                        </div>
                        <div className="hook-card-badges">
                          <span className={`badge badge-${approvalTone(item.approvalStatus)}`}>
                            {approvalLabels[item.approvalStatus]}
                          </span>
                          <span className={`badge badge-${asyncTone(item.voiceCloneStatus)}`}>
                            Voix {asyncStatusLabels[item.voiceCloneStatus]}
                          </span>
                        </div>
                      </div>

                      <p className="hook-card-scene">{item.sceneDescription ?? "Pas de description de scene."}</p>

                      <div className="hook-card-footer">
                        <small>Termine le {formatDate(item.updatedAt)}</small>
                        <div className="hook-card-actions">
                          <button className="secondary-button compact-button" onClick={() => focusHook(item)} type="button">
                            Selectionner
                          </button>
                          {item.approvalStatus === "approved" && item.voiceCloneStatus === "ready" ? (
                            <button className="primary-button compact-button" onClick={() => { setSelectedHookId(item.id); setSelectedStep(3); }} type="button">
                              Ouvrir la demo
                            </button>
                          ) : (
                            <button
                              className="primary-button compact-button"
                              disabled={!elevenLabsReady || approveBusyId === item.id}
                              onClick={() => void handleApproveHook(item)}
                              type="button"
                            >
                              {approveBusyId === item.id ? "Traitement..." : item.voiceCloneStatus === "failed" ? "Relancer" : "Utiliser ce hook"}
                            </button>
                          )}
                        </div>
                      </div>

                      {item.errorMessage ? <p className="error-inline">{item.errorMessage}</p> : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {selectedStep === 3 ? (
            <section className="panel step-panel">
              <div className="panel-header">
                <div>
                  <h2>Etape 3 — Demo finale</h2>
                  <p>Choisir une demo, editer le script, generer la voix puis remplacer l&apos;audio d&apos;origine.</p>
                </div>
                <span className={`badge badge-${readyStep3 ? "success" : "neutral"}`}>
                  {readyStep3 ? "Debloquee" : "Verrouillee"}
                </span>
              </div>

              {!selectedHook ? (
                <div className="empty-state compact-empty">
                  <h3>Aucun hook actif</h3>
                  <p>Validez d&apos;abord un hook dans l&apos;etape 2.</p>
                </div>
              ) : !readyStep3 ? (
                <div className="notice-box">
                  <strong>La demo finale est encore verrouillee</strong>
                  <p>
                    Le hook doit etre valide et la voix clonee doit etre prete avant d&apos;ouvrir la
                    bibliotheque de demos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="selected-hook-summary">
                    <div className="summary-card">
                      <span>Hook actif</span>
                      <strong>{copyForHookCard(selectedHook)}</strong>
                      <p>{selectedHook.elevenlabsVoiceName ?? "Voix clonee prete"}</p>
                    </div>
                    <div className="summary-card">
                      <span>Voix</span>
                      <strong>{asyncStatusLabels[selectedHook.voiceCloneStatus]}</strong>
                      <p>
                        {selectedHook.hookAudioUrl ? "Audio hook extrait et stocke." : "Audio hook non expose."}
                      </p>
                    </div>
                    <div className="summary-card">
                      <span>MP4 final</span>
                      <strong>{asyncStatusLabels[selectedHook.finalVideoStatus]}</strong>
                      <p>
                        {selectedHook.finalVideoUrl ? "Un rendu existe deja et sera remplace si vous regenez." : "Aucun rendu final pour le moment."}
                      </p>
                    </div>
                  </div>

                  <div className="demo-stage-grid">
                    <section className="subpanel">
                      <div className="subpanel-header">
                        <div>
                          <h3>Bibliotheque de demos</h3>
                          <p>La liste se charge seulement quand cette etape est accessible.</p>
                        </div>
                        <button
                          className="secondary-button compact-button"
                          disabled={loadingDemos}
                          onClick={() => void refreshDemoLibrary()}
                          type="button"
                        >
                          {loadingDemos ? "Chargement..." : "Rafraichir"}
                        </button>
                      </div>

                      {demosError ? <p className="error-inline">{demosError}</p> : null}

                      <div className="demo-grid">
                        {demos.length === 0 ? (
                          <div className="empty-state compact-empty">
                            <h3>Aucune demo</h3>
                            <p>Ajoutez votre premiere video de demo dans le panneau ci-dessous.</p>
                          </div>
                        ) : (
                          demos.map((demo) => {
                            const isEditing = editingDemoId === demo.id;
                            const isSelected = selectedDemoId === demo.id;

                            return (
                              <article className={`demo-card ${isSelected ? "is-selected" : ""}`} key={demo.id}>
                                <div className="demo-card-head">
                                  <div>
                                    <h3>{demo.name}</h3>
                                    <small>{formatDuration(demo.durationSeconds)}</small>
                                  </div>
                                  {isSelected ? <span className="badge badge-success">Choisie</span> : null}
                                </div>

                                <video
                                  className="video-preview compact-video"
                                  controls
                                  playsInline
                                  preload="metadata"
                                  src={demo.videoUrl}
                                />

                                <p className="demo-default-script">{demo.defaultScript}</p>

                                <div className="demo-card-actions">
                                  <button className="primary-button compact-button" onClick={() => handlePickDemo(demo)} type="button">
                                    {isSelected ? "Selection actuelle" : "Choisir cette demo"}
                                  </button>
                                  <button className="secondary-button compact-button" onClick={() => startEditingDemo(demo)} type="button">
                                    Modifier
                                  </button>
                                </div>

                                {isEditing ? (
                                  <div className="inline-editor">
                                    <label className="field">
                                      <span>Nom de la demo</span>
                                      <input
                                        onChange={(event) => setEditingDemoName(event.target.value)}
                                        type="text"
                                        value={editingDemoName}
                                      />
                                    </label>

                                    <label className="field">
                                      <span>Script par defaut</span>
                                      <textarea
                                        onChange={(event) => setEditingDemoDefaultScript(event.target.value)}
                                        rows={4}
                                        value={editingDemoDefaultScript}
                                      />
                                    </label>

                                    <div className="demo-card-actions">
                                      <button
                                        className="primary-button compact-button"
                                        disabled={savingDemoEdit}
                                        onClick={() => void handleSaveDemoEdit(demo)}
                                        type="button"
                                      >
                                        {savingDemoEdit ? "Sauvegarde..." : "Sauvegarder"}
                                      </button>
                                      <button
                                        className="secondary-button compact-button"
                                        disabled={savingDemoEdit}
                                        onClick={() => setEditingDemoId(null)}
                                        type="button"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </article>
                            );
                          })
                        )}
                      </div>

                      {editDemoError ? <p className="error-inline">{editDemoError}</p> : null}
                    </section>

                    <section className="subpanel">
                      <div className="subpanel-header">
                        <div>
                          <h3>Ajouter une demo</h3>
                          <p>La bibliotheque est reutilisable sur tous les hooks valides.</p>
                        </div>
                      </div>

                      <form className="wizard-form compact-form" onSubmit={handleCreateDemo} ref={createDemoFormRef}>
                        <label className="field">
                          <span>Nom</span>
                          <input
                            name="name"
                            onChange={(event) => setNewDemoName(event.target.value)}
                            required
                            type="text"
                            value={newDemoName}
                          />
                        </label>

                        <label className="field">
                          <span>Script par defaut</span>
                          <textarea
                            name="defaultScript"
                            onChange={(event) => setNewDemoDefaultScript(event.target.value)}
                            required
                            rows={4}
                            value={newDemoDefaultScript}
                          />
                        </label>

                        <label className="field">
                          <span>Video MP4</span>
                          <input accept="video/mp4,video/*" name="demoVideo" required type="file" />
                        </label>

                        {createDemoError ? <p className="error-inline">{createDemoError}</p> : null}

                        <button className="primary-button" disabled={creatingDemo} type="submit">
                          {creatingDemo ? "Creation..." : "Ajouter la demo"}
                        </button>
                      </form>
                    </section>
                  </div>

                  <section className="subpanel final-render-panel">
                    <div className="subpanel-header">
                      <div>
                        <h3>Script final et rendu MP4</h3>
                        <p>Le texte est precharge depuis la demo puis modifiable manuellement.</p>
                      </div>
                    </div>

                    <form className="wizard-form" onSubmit={handleFinalizeDemo}>
                      <div className="field-grid">
                        <div className="field static-field">
                          <span>Demo selectionnee</span>
                          <strong>{selectedDemo ? selectedDemo.name : "Choisissez une demo"}</strong>
                          <small>
                            {selectedDemo
                              ? `${formatDuration(selectedDemo.durationSeconds)} · audio original mute au rendu`
                              : "Aucune demo selectionnee"}
                          </small>
                        </div>

                        <div className="field static-field">
                          <span>Voix du hook</span>
                          <strong>{selectedHook.elevenlabsVoiceName ?? "Voix clonee prete"}</strong>
                          <small>Le voiceover utilise exclusivement la voix clonee du hook valide.</small>
                        </div>
                      </div>

                      <label className="field">
                        <span>Texte lu dans la demo finale</span>
                        <textarea
                          onChange={(event) => {
                            setDemoScript(event.target.value);
                            setDemoScriptDirty(true);
                          }}
                          placeholder="Choisissez une demo pour recuperer son texte par defaut."
                          required
                          rows={6}
                          value={demoScript}
                        />
                      </label>

                      {!elevenLabsReady ? (
                        <div className="notice-box">
                          <strong>ElevenLabs n&apos;est pas configure</strong>
                          <p>Le rendu final restera bloque tant que `ELEVENLABS_API_KEY` manque.</p>
                        </div>
                      ) : null}

                      {finalizeError ? <p className="error-inline">{finalizeError}</p> : null}

                      <div className="form-actions">
                        <button className="primary-button" disabled={!canSubmitFinalDemo} type="submit">
                          {finalizingHookId === selectedHook.id ? "Rendu final en cours..." : "Generer le MP4 final"}
                        </button>

                        <button
                          className="secondary-button"
                          disabled={loadingDemos}
                          onClick={() => void refreshDemoLibrary()}
                          type="button"
                        >
                          Recharger les demos
                        </button>
                      </div>
                    </form>

                    <div className="asset-columns">
                      {selectedHook.hookAudioUrl ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>Audio du hook</span>
                            <a href={selectedHook.hookAudioUrl} rel="noreferrer" target="_blank">
                              Telecharger
                            </a>
                          </div>
                          <audio className="audio-preview" controls preload="metadata" src={selectedHook.hookAudioUrl} />
                        </article>
                      ) : null}

                      {selectedHook.voiceoverUrl ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>Voiceover genere</span>
                            <a href={selectedHook.voiceoverUrl} rel="noreferrer" target="_blank">
                              Telecharger
                            </a>
                          </div>
                          <audio className="audio-preview" controls preload="metadata" src={selectedHook.voiceoverUrl} />
                        </article>
                      ) : null}
                    </div>

                    {selectedHook.finalVideoUrl ? (
                      <article className="final-video-card">
                        <div className="asset-header">
                          <span>MP4 final</span>
                          <a href={selectedHook.finalVideoUrl} rel="noreferrer" target="_blank">
                            Ouvrir le MP4
                          </a>
                        </div>
                        <video
                          className="video-preview"
                          controls
                          playsInline
                          preload="metadata"
                          src={selectedHook.finalVideoUrl}
                        />
                        <p className="final-video-note">
                          Une nouvelle generation remplacera ce rendu final dans l&apos;interface.
                        </p>
                      </article>
                    ) : null}
                  </section>
                </>
              )}
            </section>
          ) : null}
        </div>

        <aside className="panel history-panel">
          <div className="panel-header">
            <div>
              <h2>Historique des hooks</h2>
              <p>Toutes les generations restent visibles, avec reprise automatique du dernier hook approuve.</p>
            </div>
            <span className="badge badge-neutral">{historyItems.length} hooks</span>
          </div>

          <div className="history-list">
            {historyItems.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>Aucun hook</h3>
                <p>Le premier hook apparaitra ici des qu&apos;il sera cree.</p>
              </div>
            ) : (
              historyItems.map((item) => (
                <article
                  className={`history-card ${selectedHookId === item.id ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="history-card-head">
                    <span className={`badge badge-${generationTone(item.status)}`}>
                      {hookStatusLabels[item.status]}
                    </span>
                    <span className={`badge badge-${approvalTone(item.approvalStatus)}`}>
                      {approvalLabels[item.approvalStatus]}
                    </span>
                  </div>

                  <strong>{copyForHookCard(item)}</strong>
                  <p>{item.sceneDescription ?? "Pas de description de scene."}</p>

                  {selectedHookId === item.id && item.videoUrl ? (
                    <video
                      className="video-preview compact-video history-video"
                      controls
                      playsInline
                      preload="metadata"
                      src={item.videoUrl}
                    />
                  ) : null}

                  <div className="history-card-meta">
                    <small>{modelLabel(item.model)} · {item.seconds}s</small>
                    <small>Voix {asyncStatusLabels[item.voiceCloneStatus]}</small>
                  </div>

                  {item.videoUrl ? null : (
                    <div className="progress-rail compact-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${Math.max(item.progressPercent, item.status === "completed" ? 100 : 8)}%` }}
                      />
                    </div>
                  )}

                  <div className="history-card-actions">
                    <button className="secondary-button compact-button" onClick={() => focusHook(item)} type="button">
                      {item.id.startsWith("pending-") ? "Génération..." : selectedHookId === item.id ? "Sélectionné" : "Lire ce hook"}
                    </button>
                    {item.status === "completed" ? (
                      <button className="primary-button compact-button" onClick={() => openHookInValidation(item)} type="button">
                        Utiliser ce hook
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
