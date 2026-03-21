"use client";

import Image from "next/image";
import { startTransition, useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import {
  DEFAULT_DURATION_SECONDS,
  DEFAULT_MODEL,
  DURATION_OPTIONS,
  HOOK_GENERATION_COUNT_OPTIONS,
  MODEL_OPTIONS,
} from "@/lib/sora/config";
import {
  DEFAULT_HOOK_SCENE_PRESET_ID,
  DEFAULT_HOOK_SHOT_PRESET_ID,
  HOOK_SCENE_PRESETS,
  HOOK_SHOT_PRESETS,
  getDefaultSceneDescription,
  getHookScenePreset,
  getHookShotPreset,
  isCustomHookScenePreset,
  type HookScenePresetId,
  type HookShotPresetId,
} from "@/lib/sora/hook-presets";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { DemoAsset, GenerationRecord, Persona, SoraModel } from "@/lib/sora/types";

import { useI18n, useT } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { LocaleSwitcher } from "./locale-switcher";
import { BottomNav, type TabId } from "./bottom-nav";
import { MediaView } from "./media-view";
import { PersonaView } from "./persona-view";
import { SettingsView } from "./settings-view";

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

type PersonaLibraryResponse = {
  items: Persona[];
};

type PersonaItemResponse = {
  item: Persona;
};

type ApiError = {
  error?: string;
};

type WizardStep = 1 | 2 | 3 | 4;

function formatDate(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) {
    return "";
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

async function requestPersonaLibrary() {
  const response = await fetch("/api/personas", { cache: "no-store" });
  const payload = (await response.json()) as PersonaLibraryResponse | ApiError;

  if (!response.ok || isApiError(payload)) {
    throw new Error(
      requestError(
        isApiError(payload) ? payload : undefined,
        "Impossible de recuperer les personas.",
      ),
    );
  }

  return payload.items;
}

/* stepTitles, hookStatusLabels, asyncStatusLabels, approvalLabels moved inside SoraStudio for i18n reactivity */

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
    return 4;
  }

  if (item.approvalStatus === "approved") {
    return 3;
  }

  if (item.status === "completed") {
    return 2;
  }

  return 1;
}

function isRenderUnlocked(item?: GenerationRecord | null) {
  return Boolean(item && item.approvalStatus === "approved" && item.voiceCloneStatus === "ready");
}

function copyForHookCard(item: GenerationRecord) {
  return item.spokenText ?? item.prompt;
}

function estimateDemoScriptFit(text: string, durationSeconds: number | undefined, t: Dictionary) {
  if (!durationSeconds || !text.trim()) {
    return null;
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const targetWords = durationSeconds * 2.4;
  const ratio = words / targetWords;
  const d = Math.round(durationSeconds);

  if (ratio <= 0.85) {
    return {
      tone: "success" as const,
      label: t.studio.fitComfortable,
      hint: t.studio.fitComfortableHint(words, d),
    };
  }

  if (ratio <= 1.1) {
    return {
      tone: "accent" as const,
      label: t.studio.fitDense,
      hint: t.studio.fitDenseHint(words, d),
    };
  }

  return {
    tone: "danger" as const,
    label: t.studio.fitTooLong,
    hint: t.studio.fitTooLongHint(words, d),
  };
}

function MicroFlow({
  steps,
  active,
  onSelect,
  warnings,
}: {
  steps: string[];
  active: number;
  onSelect: (index: number) => void;
  warnings?: (string | null)[];
}) {
  return (
    <div className="micro-flow">
      {steps.map((label, i) => {
        const warn = warnings?.[i];
        const done = i < active && !warn;
        const cls = [
          "micro-flow-pill",
          i === active ? "is-active" : "",
          done ? "is-done" : "",
          warn ? "is-warn" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div className="micro-flow-node" key={label}>
            <button className={cls} onClick={() => onSelect(i)} type="button">
              <span className="micro-flow-num">{i + 1}</span>
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function SubStepNav({
  current,
  total,
  onPrev,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="substep-nav">
      {current > 0 ? (
        <button className="secondary-button" onClick={onPrev} type="button">
          {t.studio.previous}
        </button>
      ) : (
        <span />
      )}
      {current < total - 1 ? (
        <button className="primary-button" disabled={nextDisabled} onClick={onNext} type="button">
          {nextLabel ?? t.studio.next}
        </button>
      ) : null}
    </div>
  );
}

function InlineVideoPreview({
  src,
  className,
  label,
}: {
  src: string;
  className?: string;
  label?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const t = useT();

  async function handleFullscreen() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (document.fullscreenElement !== video && video.requestFullscreen) {
      await video.requestFullscreen();
      return;
    }

    const webkitVideo = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
    webkitVideo.webkitEnterFullscreen?.();
  }

  return (
    <div className={`video-shell ${className ?? ""}`.trim()}>
      <div className="video-shell-actions">
        <button className="secondary-button compact-button" onClick={() => void handleFullscreen()} type="button">
          {label ?? t.common.openFullscreen}
        </button>
      </div>
      <video
        ref={videoRef}
        className="video-preview"
        controls
        playsInline
        preload="metadata"
        src={src}
      />
    </div>
  );
}

export function SoraStudio() {
  const { locale, t } = useI18n();

  const shotPresetI18n: Record<string, { name: string; badge: string; summary: string; context: string }> = {
    selfie_handheld: { name: t.shotPresets.selfie, badge: t.shotPresets.selfieBadge, summary: t.shotPresets.selfieSummary, context: t.shotPresets.selfieContext },
    phone_front_fixed: { name: t.shotPresets.frontFixed, badge: t.shotPresets.frontFixedBadge, summary: t.shotPresets.frontFixedSummary, context: t.shotPresets.frontFixedContext },
    phone_off_axis: { name: t.shotPresets.offAxis, badge: t.shotPresets.offAxisBadge, summary: t.shotPresets.offAxisSummary, context: t.shotPresets.offAxisContext },
    custom: { name: t.shotPresets.custom, badge: t.shotPresets.customBadge, summary: t.shotPresets.customSummary, context: t.shotPresets.customContext },
  };

  const scenePresetI18n: Record<string, { name: string; badge: string; summary: string; context: string }> = {
    indoor_home: { name: t.scenePresets.indoorHome, badge: t.scenePresets.indoorHomeBadge, summary: t.scenePresets.indoorHomeSummary, context: t.scenePresets.indoorHomeContext },
    kitchen: { name: t.scenePresets.kitchen, badge: t.scenePresets.kitchenBadge, summary: t.scenePresets.kitchenSummary, context: t.scenePresets.kitchenContext },
    bathroom: { name: t.scenePresets.bathroom, badge: t.scenePresets.bathroomBadge, summary: t.scenePresets.bathroomSummary, context: t.scenePresets.bathroomContext },
    car: { name: t.scenePresets.car, badge: t.scenePresets.carBadge, summary: t.scenePresets.carSummary, context: t.scenePresets.carContext },
    outdoor: { name: t.scenePresets.outdoor, badge: t.scenePresets.outdoorBadge, summary: t.scenePresets.outdoorSummary, context: t.scenePresets.outdoorContext },
    custom: { name: t.scenePresets.custom, badge: t.scenePresets.customBadge, summary: t.scenePresets.customSummary, context: t.scenePresets.customContext },
  };

  const stepTitles: Array<{ step: WizardStep; title: string; caption: string }> = [
    { step: 1, title: "Hook", caption: t.studio.stepHookCaption },
    { step: 2, title: "Demo", caption: t.studio.stepDemoCaption },
    { step: 3, title: t.studio.stepVoice, caption: t.studio.stepVoiceCaption },
    { step: 4, title: t.studio.stepRender, caption: t.studio.stepRenderCaption },
  ];

  const hookStatusLabels: Record<GenerationRecord["status"], string> = {
    queued: t.status.queued,
    in_progress: t.status.processing,
    completed: t.status.completed,
    failed: t.status.failed,
    unknown: t.status.unknown,
  };

  const asyncStatusLabels: Record<GenerationRecord["voiceCloneStatus"], string> = {
    idle: t.status.idle,
    processing: t.status.processing,
    ready: t.status.ready,
    failed: t.status.failed,
  };

  const approvalLabels: Record<GenerationRecord["approvalStatus"], string> = {
    draft: t.status.draft,
    approved: t.status.approved,
    rejected: t.status.rejected,
  };

  const [items, setItems] = useState<GenerationRecord[]>([]);
  const [demos, setDemos] = useState<DemoAsset[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("make");
  const [envReady, setEnvReady] = useState(false);
  const [elevenLabsReady, setElevenLabsReady] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(10_000);
  const [selectedStep, setSelectedStep] = useState<WizardStep>(1);
  const [subStep, setSubStep] = useState(0);
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [shotPresetId, setShotPresetId] = useState<HookShotPresetId>(DEFAULT_HOOK_SHOT_PRESET_ID);
  const [scenePresetId, setScenePresetId] = useState<HookScenePresetId>(DEFAULT_HOOK_SCENE_PRESET_ID);
  const [spokenText, setSpokenText] = useState("");
  const [sceneDescription, setSceneDescription] = useState(getDefaultSceneDescription(DEFAULT_HOOK_SCENE_PRESET_ID));
  const [model, setModel] = useState<SoraModel>(DEFAULT_MODEL);
  const [seconds, setSeconds] = useState<number>(DEFAULT_DURATION_SECONDS);
  const [generationCount, setGenerationCount] = useState<number>(1);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [useReferenceScene, setUseReferenceScene] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [demosError, setDemosError] = useState<string | null>(null);
  const [createDemoError, setCreateDemoError] = useState<string | null>(null);
  const [editDemoError, setEditDemoError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [submittingHook, setSubmittingHook] = useState(false);
  const [pendingHookPreviews, setPendingHookPreviews] = useState<GenerationRecord[]>([]);
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
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loadingPersonas, setLoadingPersonas] = useState(false);
  const [personasError, setPersonasError] = useState<string | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [creatingPersona, setCreatingPersona] = useState(false);
  const [createPersonaError, setCreatePersonaError] = useState<string | null>(null);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newPersonaNotes, setNewPersonaNotes] = useState("");
  const createDemoFormRef = useRef<HTMLFormElement | null>(null);
  const createPersonaFormRef = useRef<HTMLFormElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepperRef = useRef<HTMLDivElement | null>(null);

  // sliding indicator under the active tab
  const syncIndicator = useCallback(() => {
    const track = stepperRef.current;
    if (!track) return;
    const activeTab = track.querySelector<HTMLElement>(".step-tab.is-active");
    if (!activeTab) return;
    track.style.setProperty("--indicator-left", `${activeTab.offsetLeft}px`);
    track.style.setProperty("--indicator-width", `${activeTab.offsetWidth}px`);
  }, []);

  useEffect(() => {
    syncIndicator();
  }, [selectedStep, syncIndicator]);

  useEffect(() => {
    window.addEventListener("resize", syncIndicator);
    return () => window.removeEventListener("resize", syncIndicator);
  }, [syncIndicator]);

  function goToStep(step: WizardStep, sub = 0) {
    setSelectedStep(step);
    setSubStep(sub);
  }

  const step1Subs = [t.studio.subPreset, t.studio.subText, t.studio.subCreatorPhoto, t.studio.subGenerate];
  const step2Subs = [t.studio.subChooseDemo, t.studio.subWriteText];

  const selectedHook = items.find((item) => item.id === selectedHookId) ?? null;
  const selectedShotPreset = getHookShotPreset(shotPresetId);
  const selectedScenePreset = getHookScenePreset(scenePresetId);
  const isCustomScenePreset = isCustomHookScenePreset(scenePresetId);
  const hasSelectedHook = Boolean(selectedHook);
  const persistedSelectedDemoId = selectedHook?.selectedDemoId ?? "";
  const persistedDemoScript = selectedHook?.demoScriptDraft ?? "";
  const selectedDemo = demos.find((demo) => demo.id === selectedDemoId) ?? null;
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) ?? null;
  const hasReferenceIdentity = Boolean(selectedPersona || referenceImage);
  const activeCount = items.filter((item) => item.status === "queued" || item.status === "in_progress").length;
  const readyForRender = isRenderUnlocked(selectedHook);
  const historyItems = pendingHookPreviews.length > 0 ? [...pendingHookPreviews, ...items] : items;
  const demoScriptFit = estimateDemoScriptFit(demoScript, selectedDemo?.durationSeconds, t);

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
      setDashboardError(error instanceof Error ? error.message : t.studio.fetchHooksError);
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
      setDashboardError(error instanceof Error ? error.message : t.studio.fetchHooksError);
    } finally {
      setRefreshing(false);
    }
  });

  const refreshDemoLibrary = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setLoadingDemos(true);
    }

    try {
      const nextDemos = await requestDemoLibrary();
      setDemos(nextDemos);
      setDemosError(null);
    } catch (error) {
      setDemosError(
        error instanceof Error ? error.message : t.studio.fetchDemosError,
      );
    } finally {
      setLoadingDemos(false);
    }
  }, [t.studio.fetchDemosError]);

  const refreshPersonaLibrary = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoadingPersonas(true);
    try {
      setPersonas(await requestPersonaLibrary());
      setPersonasError(null);
    } catch (error) {
      setPersonasError(error instanceof Error ? error.message : t.studio.fetchPersonasError);
    } finally {
      setLoadingPersonas(false);
    }
  }, [t.studio.fetchPersonasError]);

  function handlePickPersona(persona: Persona) {
    setSelectedPersonaId(persona.id);
    setReferenceImage(null);
    setReferencePreviewUrl(persona.photoUrl);
  }

  async function handleCreatePersona(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingPersona(true);
    setCreatePersonaError(null);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("name", newPersonaName);
      if (newPersonaNotes) formData.set("notes", newPersonaNotes);

      const response = await fetch("/api/personas", { method: "POST", body: formData });
      const payload = (await response.json()) as PersonaItemResponse | ApiError;

      if (!response.ok || isApiError(payload)) {
        throw new Error(requestError(isApiError(payload) ? payload : undefined, t.studio.createPersonaError));
      }

      handlePickPersona((payload as PersonaItemResponse).item);
      setNewPersonaName("");
      setNewPersonaNotes("");
      setShowPersonaModal(false);
      createPersonaFormRef.current?.reset();
      await refreshPersonaLibrary(false);
    } catch (error) {
      setCreatePersonaError(error instanceof Error ? error.message : t.studio.createPersonaError);
    } finally {
      setCreatingPersona(false);
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
      setDemoScript(selectedHook?.spokenText || selectedDemo.defaultScript);
    }
  }, [
    selectedDemo,
    selectedHook?.selectedDemoId,
    selectedHook?.demoScriptDraft,
    selectedHook?.spokenText,
    demoScriptDirty,
    demoScript,
  ]);

  useEffect(() => {
    if (selectedStep !== 2) {
      return;
    }

    void refreshDemoLibrary(false);
  }, [refreshDemoLibrary, selectedStep]);

  useEffect(() => {
    void refreshPersonaLibrary(false);
  }, [refreshPersonaLibrary]);

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

    if (!selectedPersonaId) {
      setUseReferenceScene(false);
    }
    setReferencePreviewUrl(null);
  }

  function handleScenePresetSelect(nextPresetId: HookScenePresetId) {
    const previousPreset = getHookScenePreset(scenePresetId);
    const nextPreset = getHookScenePreset(nextPresetId);

    setScenePresetId(nextPresetId);

    if (isCustomHookScenePreset(nextPresetId)) {
      if (!sceneDescription.trim() || sceneDescription === previousPreset.sceneStarter) {
        setSceneDescription("");
      }
      return;
    }

    if (!sceneDescription.trim() || sceneDescription === previousPreset.sceneStarter || isCustomHookScenePreset(scenePresetId)) {
      setSceneDescription(nextPreset.sceneStarter);
    }
  }

  function buildPendingHookPreview(input: { spokenText: string; sceneDescription: string; index: number }) {
    const now = new Date().toISOString();

    return {
      id: `pending-${now}-${input.index}`,
      prompt: input.spokenText,
      spokenText: input.spokenText,
      sceneDescription: input.sceneDescription,
      model,
      seconds,
      size: "720x1280",
      status: "in_progress" as const,
      progressPercent: 8,
      inputMode: selectedPersonaId || referenceImage ? "text_plus_image" as const : "text" as const,
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

  async function handleTranscribe() {
    const url = tiktokUrl.trim();
    if (!url) return;

    setTranscribing(true);
    setTranscribeError(null);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json()) as { text?: string; error?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "La transcription a echoue.");
      }

      if (payload.text) {
        setSpokenText(payload.text);
      }
    } catch (error) {
      setTranscribeError(error instanceof Error ? error.message : "La transcription a echoue.");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleHookSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingHook(true);
    setDashboardError(null);

    try {
      const formData = new FormData();
      const resolvedSceneDescription = isCustomScenePreset ? sceneDescription : selectedScenePreset.sceneStarter;
      const optimisticHooks = Array.from({ length: generationCount }, (_, index) =>
        buildPendingHookPreview({
          spokenText,
          sceneDescription: resolvedSceneDescription,
          index,
        }),
      );

      setPendingHookPreviews(optimisticHooks);

      formData.set("shotPresetId", shotPresetId);
      formData.set("scenePresetId", scenePresetId);
      formData.set("spokenText", spokenText);
      formData.set("sceneDescription", resolvedSceneDescription);
      formData.set("useReferenceScene", String(useReferenceScene));
      formData.set("count", String(generationCount));
      formData.set("model", model);
      formData.set("seconds", String(seconds));

      if (referenceImage) {
        formData.set("referenceImage", referenceImage);
      }

      if (selectedPersonaId) {
        formData.set("personaId", selectedPersonaId);
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

      setPendingHookPreviews([]);
      if (payload.items.length > 0) {
        setItems((current) => {
          const next = [...payload.items, ...current.filter((item) => !payload.items.some((created) => created.id === item.id))];
          return next;
        });
      }

      goToStep(1);
      setShotPresetId(DEFAULT_HOOK_SHOT_PRESET_ID);
      setScenePresetId(DEFAULT_HOOK_SCENE_PRESET_ID);
      setSpokenText("");
      setTiktokUrl("");
      setTranscribeError(null);
      setSceneDescription(getDefaultSceneDescription(DEFAULT_HOOK_SCENE_PRESET_ID));
      setGenerationCount(1);
      setReferenceImage(null);
      setUseReferenceScene(false);
      setSelectedPersonaId(null);
      if (referencePreviewUrl) {
        URL.revokeObjectURL(referencePreviewUrl);
      }
      setReferencePreviewUrl(null);

      await refreshDashboard(false);
    } catch (error) {
      setPendingHookPreviews([]);
      setDashboardError(error instanceof Error ? error.message : "La generation du hook a echoue.");
    } finally {
      setSubmittingHook(false);
    }
  }

  async function handleApproveHook(item: GenerationRecord, nextStep: WizardStep = stepForHook(item)) {
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
        throw new Error(requestError(isApiError(payload) ? payload : undefined, t.studio.hookApprovalFailed));
      }

      setSelectedHookId(payload.item.id);
      goToStep(nextStep);
      await refreshDashboard(false);
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : t.studio.hookApprovalFailed);
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
        throw new Error(requestError(isApiError(payload) ? payload : undefined, t.studio.renderFailed));
      }

      await refreshDashboard(false);
    } catch (error) {
      setFinalizeError(error instanceof Error ? error.message : t.studio.renderFailed);
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
    readyForRender &&
    Boolean(selectedDemoId) &&
    Boolean(demoScript.trim()) &&
    !finalizingHookId &&
    elevenLabsReady;

  async function handleUseHook(item: GenerationRecord) {
    setSelectedHookId(item.id);
    goToStep(2);

    if (item.status !== "completed") {
      return;
    }

    if (item.approvalStatus === "approved" && (item.voiceCloneStatus === "ready" || item.voiceCloneStatus === "processing")) {
      return;
    }

    await handleApproveHook(item, 2);
  }

  return (
    <>
    <main className="page-shell">
      <div className="page-backdrop">
        <header className="app-header">
          <h1>Bulk UGC</h1>
          <LocaleSwitcher />
        </header>

        {activeTab === "make" ? (
        <section className="wizard-shell">
          <div className="stepper-track" ref={stepperRef}>
            {stepTitles.map((step) => {
              const active = selectedStep === step.step;

              return (
                <button
                  className={`step-tab ${active ? "is-active" : ""}`}
                  key={step.step}
                  onClick={() => goToStep(step.step)}
                  type="button"
                >
                  <span className="step-num">{String(step.step).padStart(2, "0")}</span>
                  <strong>{step.title}</strong>
                </button>
              );
            })}
          </div>

          {selectedStep === 1 ? (
            <MicroFlow
              steps={step1Subs}
              active={subStep}
              onSelect={setSubStep}
              warnings={[
                null,
                spokenText.trim() ? null : t.studio.textMissing,
                null,
                null,
              ]}
            />
          ) : null}
          {selectedStep === 2 ? (
            <MicroFlow
              steps={step2Subs}
              active={subStep}
              onSelect={setSubStep}
              warnings={[
                selectedDemoId ? null : t.studio.noDemo,
                demoScript.trim() ? null : t.studio.textMissing,
              ]}
            />
          ) : null}

        <div className={`wizard-body ${selectedStep > 1 ? "wizard-body--full" : ""}`}>
        <div className="wizard-main">
          {dashboardError ? <p className="error-box">{dashboardError}</p> : null}

          {selectedStep === 1 ? (
            <section className="panel step-panel">

              {subStep === 0 ? (
                <div className="substep-content">
                  <div className="field">
                    <span>{t.studio.shotPresetLabel}</span>
                    <div className="preset-grid">
                      {HOOK_SHOT_PRESETS.filter((preset) => preset.id !== "custom").map((preset) => {
                        const isActive = preset.id === shotPresetId;
                        const pi = shotPresetI18n[preset.id];

                        return (
                          <button
                            className={`preset-card ${isActive ? "is-active" : ""}`}
                            key={preset.id}
                            onClick={() => setShotPresetId(preset.id)}
                            title={`${pi?.summary ?? preset.summary} ${pi?.context ?? preset.shootingContext}`}
                            type="button"
                          >
                            <div className="preset-card-head">
                              <strong>{pi?.name ?? preset.name}</strong>
                              <span className="badge badge-neutral">{pi?.badge ?? preset.badge}</span>
                            </div>
                            <div className="preset-tooltip" role="presentation">
                              <p>{pi?.summary ?? preset.summary}</p>
                              <small>{pi?.context ?? preset.shootingContext}</small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="field">
                    <span>{t.studio.scenePresetLabel}</span>
                    <div className="preset-grid">
                      {HOOK_SCENE_PRESETS.map((preset) => {
                        const isActive = preset.id === scenePresetId;
                        const pi = scenePresetI18n[preset.id];

                        return (
                          <button
                            className={`preset-card ${isActive ? "is-active" : ""}`}
                            key={preset.id}
                            onClick={() => handleScenePresetSelect(preset.id)}
                            title={`${pi?.summary ?? preset.summary} ${pi?.context ?? ""}`}
                            type="button"
                          >
                            <div className="preset-card-head">
                              <strong>{pi?.name ?? preset.name}</strong>
                              <span className="badge badge-neutral">{pi?.badge ?? preset.badge}</span>
                            </div>
                            <div className="preset-tooltip" role="presentation">
                              <p>{pi?.summary ?? preset.summary}</p>
                              <small>{pi?.context ?? ""}</small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {isCustomScenePreset ? (
                    <label className="field">
                      <span>{t.studio.customSceneLabel}</span>
                      <textarea
                        onChange={(event) => setSceneDescription(event.target.value)}
                        placeholder={t.studio.customScenePlaceholder}
                        rows={4}
                        value={sceneDescription}
                      />
                      <small>{t.studio.customSceneHint}</small>
                    </label>
                  ) : null}

                  <div className="field-grid">
                    <label className="field">
                      <span>{t.studio.modelLabel}</span>
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
                      <span>{t.studio.durationLabel}</span>
                      <select value={seconds} onChange={(event) => setSeconds(Number(event.target.value))}>
                        {DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <SubStepNav
                    current={0}
                    total={step1Subs.length}
                    onPrev={() => setSubStep(0)}
                    onNext={() => setSubStep(1)}
                    nextDisabled={isCustomScenePreset && !sceneDescription.trim()}
                  />
                </div>
              ) : null}

              {subStep === 1 ? (
                <div className="substep-content">
                  <div className="field">
                    <span>{t.studio.importFromTiktok}</span>
                    <div className="transcribe-row">
                      <input
                        className="transcribe-url-input"
                        onChange={(event) => setTiktokUrl(event.target.value)}
                        placeholder="https://www.tiktok.com/@user/video/..."
                        type="url"
                        value={tiktokUrl}
                      />
                      <button
                        className="secondary-button compact-button"
                        disabled={transcribing || !tiktokUrl.trim()}
                        onClick={() => void handleTranscribe()}
                        type="button"
                      >
                        {transcribing ? <><span className="btn-spinner" />{t.studio.transcribing}</> : t.studio.transcribe}
                      </button>
                    </div>
                    <small>{t.studio.tiktokHint}</small>
                    {transcribeError ? <p className="error-inline">{transcribeError}</p> : null}
                  </div>

                  <label className="field">
                    <span>{t.studio.spokenText}</span>
                    <textarea
                      onChange={(event) => setSpokenText(event.target.value)}
                      placeholder={t.studio.spokenTextPlaceholder}
                      rows={5}
                      value={spokenText}
                    />
                  </label>
                  <SubStepNav current={1} total={step1Subs.length} onPrev={() => setSubStep(0)} onNext={() => setSubStep(2)} nextDisabled={!spokenText.trim()} />
                </div>
              ) : null}

              {subStep === 2 ? (
                <div className="substep-content">
                  <section className="subpanel">
                    <div className="subpanel-header">
                      <div>
                        <h3>{t.studio.personas}</h3>
                        <p>{t.studio.personaLibrary}</p>
                      </div>
                      <button
                        className="secondary-button compact-button"
                        disabled={loadingPersonas}
                        onClick={() => void refreshPersonaLibrary()}
                        type="button"
                      >
                        {loadingPersonas ? t.common.loading : t.common.refresh}
                      </button>
                    </div>

                    {personasError ? <p className="error-inline">{personasError}</p> : null}

                    <div className="persona-grid">
                      {personas.length === 0 && !loadingPersonas ? (
                        <div className="empty-state compact-empty">
                          <h3>{t.studio.noPersonas}</h3>
                          <p>{t.studio.addFirstPersona}</p>
                        </div>
                      ) : (
                        personas.map((persona) => {
                          const isSelected = selectedPersonaId === persona.id;

                          return (
                            <article className={`persona-card ${isSelected ? "is-selected" : ""}`} key={persona.id}>
                              <div className="persona-photo">
                                <Image
                                  alt={persona.name}
                                  className="media-fill"
                                  fill
                                  sizes="160px"
                                  src={persona.photoUrl}
                                  unoptimized
                                />
                              </div>
                              <strong>{persona.name}</strong>
                              {persona.notes ? <small>{persona.notes}</small> : null}
                              <button
                                className="primary-button compact-button"
                                onClick={() => handlePickPersona(persona)}
                                type="button"
                              >
                                {isSelected ? t.studio.personaSelected : t.studio.personaChoose}
                              </button>
                            </article>
                          );
                        })
                      )}
                    </div>

                  </section>

                  <div className="persona-action-row">
                    <button
                      className="secondary-button"
                      onClick={() => setShowPersonaModal(true)}
                      type="button"
                    >
                      + {t.studio.addPersona}
                    </button>
                    <label className="secondary-button persona-file-label">
                      {t.studio.photoWithoutPersona}
                      <input accept="image/*" className="sr-only" onChange={(event) => { setSelectedPersonaId(null); handleImageChange(event); }} type="file" />
                    </label>
                  </div>

                  <label className={`checkbox-card ${hasReferenceIdentity ? "" : "is-disabled"}`}>
                    <input
                      checked={useReferenceScene}
                      disabled={!hasReferenceIdentity}
                      onChange={(event) => setUseReferenceScene(event.target.checked)}
                      type="checkbox"
                    />
                    <div>
                      <strong>{t.studio.usePhotoAmbience}</strong>
                      <small>{hasReferenceIdentity ? t.studio.usePhotoAmbienceHint : t.studio.usePhotoAmbienceDisabledHint}</small>
                    </div>
                  </label>

                  {showPersonaModal ? (
                    <div className="modal-backdrop" onClick={() => setShowPersonaModal(false)}>
                      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                          <h3>{t.studio.addPersona}</h3>
                          <button className="modal-close" onClick={() => setShowPersonaModal(false)} type="button">✕</button>
                        </div>
                        <p className="modal-subtitle">{t.studio.personaPhotoCrop}</p>

                        <form className="wizard-form compact-form" onSubmit={handleCreatePersona} ref={createPersonaFormRef}>
                          <label className="field">
                            <span>{t.studio.personaName}</span>
                            <input
                              name="name"
                              onChange={(event) => setNewPersonaName(event.target.value)}
                              required
                              type="text"
                              value={newPersonaName}
                            />
                          </label>

                          <label className="field">
                            <span>{t.studio.personaPhoto}</span>
                            <input accept="image/*" name="photo" required type="file" />
                          </label>

                          <label className="field">
                            <span>{t.studio.personaNotes}</span>
                            <textarea
                              name="notes"
                              onChange={(event) => setNewPersonaNotes(event.target.value)}
                              placeholder={t.studio.personaNotesPlaceholder}
                              rows={3}
                              value={newPersonaNotes}
                            />
                          </label>

                          {createPersonaError ? <p className="error-inline">{createPersonaError}</p> : null}

                          <button className="primary-button" disabled={creatingPersona} type="submit">
                            {creatingPersona ? t.common.creating : t.studio.addPersonaBtn}
                          </button>
                        </form>
                      </div>
                    </div>
                  ) : null}

                  {referencePreviewUrl ? (
                    <div className="reference-preview">
                      <Image
                        alt={t.studio.referenceImageAlt}
                        className="media-fill"
                        fill
                        sizes="(max-width: 720px) 100vw, 440px"
                        src={referencePreviewUrl}
                        unoptimized
                      />
                    </div>
                  ) : null}
                  <SubStepNav current={2} total={step1Subs.length} onPrev={() => setSubStep(1)} onNext={() => setSubStep(3)} nextLabel={t.studio.recapGenerate} />
                </div>
              ) : null}

              {subStep === 3 ? (
                <div className="substep-content">
                  {!spokenText.trim() ? (
                    <p className="field-missing">{t.studio.spokenTextRequired}</p>
                  ) : null}

                  <div className="substep-recap">
                    <div className="field static-field">
                      <span>{t.studio.shotSummaryLabel}</span>
                      <strong>{shotPresetI18n[selectedShotPreset.id]?.name ?? selectedShotPreset.name}</strong>
                    </div>
                    <div className="field static-field">
                      <span>{t.studio.sceneSummaryLabel}</span>
                      <strong>{scenePresetI18n[selectedScenePreset.id]?.name ?? selectedScenePreset.name}</strong>
                    </div>
                    <div className={`field static-field ${!spokenText.trim() ? "is-missing" : ""}`}>
                      <span>{t.studio.textLabel}</span>
                      <strong>{spokenText || t.studio.notFilled}</strong>
                      {!spokenText.trim() ? <small className="field-missing-hint">{t.studio.requiredClickStep2}</small> : null}
                    </div>
                    <div className="field static-field">
                      <span>{t.studio.modelDuration}</span>
                      <strong>{modelLabel(model)} · {seconds}s</strong>
                    </div>
                    <div className="field static-field">
                      <span>{t.studio.personaOrPhoto}</span>
                      <strong>{selectedPersona ? selectedPersona.name : referenceImage ? referenceImage.name : t.studio.noneOptional}</strong>
                      {hasReferenceIdentity && useReferenceScene ? <small>{t.studio.usePhotoAmbience}</small> : null}
                    </div>
                  </div>

                  {!envReady ? (
                    <div className="notice-box">
                      <strong>{t.studio.openaiNotConfigured}</strong>
                      <p>{t.studio.addOpenAiKey}</p>
                    </div>
                  ) : null}

                  <form className="wizard-form" onSubmit={handleHookSubmit}>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setSubStep(2)} type="button">
                        Precedent
                      </button>
                      <label className="inline-select">
                        <span>{t.studio.generationCountLabel}</span>
                        <select value={generationCount} onChange={(event) => setGenerationCount(Number(event.target.value))}>
                          {HOOK_GENERATION_COUNT_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                              {t.studio.generationCountValue(count)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="primary-button" disabled={submittingHook || !envReady || !spokenText.trim()} type="submit">
                        {submittingHook ? t.studio.generatingHook : t.studio.generateHook}
                      </button>
                    </div>
                  </form>

                  <p className="creation-counter">
                    {activeCount > 0
                      ? t.common.creationsInProgress(activeCount)
                      : t.common.noCreationsInProgress}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {selectedStep === 2 ? (
            <section className="panel step-panel">
              {!selectedHook ? (
                <div className="empty-state compact-empty">
                  <h3>{t.studio.noHookSelected}</h3>
                  <p>{t.studio.step1ChooseHook}</p>
                </div>
              ) : (
                <>
                  {!elevenLabsReady ? (
                    <div className="notice-box">
                      <strong>{t.studio.elevenLabsNotConfigured}</strong>
                      <p>{t.studio.addElevenLabsKey}</p>
                    </div>
                  ) : null}

                  {selectedHook.errorMessage ? <p className="error-inline">{selectedHook.errorMessage}</p> : null}

                  {subStep === 0 ? (
                    <div className="substep-content">
                      <div className="demo-stage-grid">
                        <section className="subpanel">
                          <div className="subpanel-header">
                            <div>
                              <h3>{t.studio.demoLibrary}</h3>
                              <p>{t.studio.demoLibraryDesc}</p>
                            </div>
                            <button
                              className="secondary-button compact-button"
                              disabled={loadingDemos}
                              onClick={() => void refreshDemoLibrary()}
                              type="button"
                            >
                              {loadingDemos ? t.common.loading : t.common.refresh}
                            </button>
                          </div>

                          {demosError ? <p className="error-inline">{demosError}</p> : null}

                          <div className="demo-grid">
                            {demos.length === 0 ? (
                              <div className="empty-state compact-empty">
                                <h3>{t.studio.noDemo}</h3>
                                <p>{t.studio.addFirstDemo}</p>
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
                                      {isSelected ? <span className="badge badge-success">{t.studio.chosen}</span> : null}
                                    </div>

                                    <video
                                      className="video-preview"
                                      controls
                                      playsInline
                                      preload="metadata"
                                      src={demo.videoUrl}
                                    />

                                    <p className="demo-default-script">{demo.defaultScript}</p>

                                    <div className="demo-card-actions">
                                      <button className="primary-button compact-button" onClick={() => handlePickDemo(demo)} type="button">
                                        {isSelected ? t.studio.currentSelection : t.studio.chooseThisDemo}
                                      </button>
                                      <button className="secondary-button compact-button" onClick={() => startEditingDemo(demo)} type="button">
                                        {t.studio.edit}
                                      </button>
                                    </div>

                                    {isEditing ? (
                                      <div className="inline-editor">
                                        <label className="field">
                                          <span>{t.studio.demoName}</span>
                                          <input
                                            onChange={(event) => setEditingDemoName(event.target.value)}
                                            type="text"
                                            value={editingDemoName}
                                          />
                                        </label>

                                        <label className="field">
                                          <span>{t.studio.demoScript}</span>
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
                                            {savingDemoEdit ? t.studio.saving : t.studio.saveBtn}
                                          </button>
                                          <button
                                            className="secondary-button compact-button"
                                            disabled={savingDemoEdit}
                                            onClick={() => setEditingDemoId(null)}
                                            type="button"
                                          >
                                            {t.common.cancel}
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
                              <h3>{t.studio.addDemo}</h3>
                              <p>{t.studio.demoLibraryReusable}</p>
                            </div>
                          </div>

                          <form className="wizard-form compact-form" onSubmit={handleCreateDemo} ref={createDemoFormRef}>
                            <label className="field">
                              <span>{t.studio.demoName}</span>
                              <input
                                name="name"
                                onChange={(event) => setNewDemoName(event.target.value)}
                                required
                                type="text"
                                value={newDemoName}
                              />
                            </label>

                            <label className="field">
                              <span>{t.studio.demoScript}</span>
                              <textarea
                                name="defaultScript"
                                onChange={(event) => setNewDemoDefaultScript(event.target.value)}
                                required
                                rows={4}
                                value={newDemoDefaultScript}
                              />
                            </label>

                            <label className="field">
                              <span>{t.studio.demoVideo}</span>
                              <input accept="video/mp4,video/*" name="demoVideo" required type="file" />
                            </label>

                            {createDemoError ? <p className="error-inline">{createDemoError}</p> : null}

                            <button className="primary-button" disabled={creatingDemo} type="submit">
                              {creatingDemo ? t.common.creating : t.studio.addDemoBtn}
                            </button>
                          </form>
                        </section>
                      </div>
                      <SubStepNav current={0} total={step2Subs.length} onPrev={() => setSubStep(0)} onNext={() => setSubStep(1)} nextDisabled={!selectedDemoId} />
                    </div>
                  ) : null}

                  {subStep === 1 ? (
                    <div className="substep-content">
                      <div className="field-grid">
                        <div className="field static-field">
                          <span>{t.studio.selectedDemo}</span>
                          <strong>{selectedDemo ? selectedDemo.name : t.studio.selectDemo}</strong>
                          <small>
                            {selectedDemo
                              ? t.studio.audioOriginalMuted(formatDuration(selectedDemo.durationSeconds))
                              : t.studio.noDemoSelected}
                          </small>
                        </div>
                      </div>

                      <label className="field">
                        <span>{t.studio.demoScriptLabel}</span>
                        <textarea
                          onChange={(event) => {
                            setDemoScript(event.target.value);
                            setDemoScriptDirty(true);
                          }}
                          placeholder={t.studio.demoScriptPlaceholder}
                          rows={6}
                          value={demoScript}
                        />
                        {demoScriptFit ? (
                          <small className={`script-fit script-fit-${demoScriptFit.tone}`}>
                            {demoScriptFit.label} · {demoScriptFit.hint}
                          </small>
                        ) : (
                          <small>{t.studio.demoScriptHint}</small>
                        )}
                      </label>
                      <div className="substep-nav">
                        <button className="secondary-button" onClick={() => setSubStep(0)} type="button">
                          Precedent
                        </button>
                        <button className="primary-button" disabled={!demoScript.trim() || !selectedDemoId} onClick={() => goToStep(3)} type="button">
                          {t.studio.continueToVoice}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          ) : null}

          {selectedStep === 3 ? (
            <section className="panel step-panel">
              {!selectedHook ? (
                <div className="empty-state compact-empty">
                  <h3>{t.studio.noHookSelected}</h3>
                  <p>{t.studio.chooseAndApproveHook}</p>
                </div>
              ) : (
                <>
                  {!elevenLabsReady ? (
                    <div className="notice-box">
                      <strong>{t.studio.elevenLabsNotConfigured}</strong>
                      <p>{t.studio.addElevenLabsKeyVoice}</p>
                    </div>
                  ) : null}

                  {selectedHook.errorMessage ? <p className="error-inline">{selectedHook.errorMessage}</p> : null}

                  <div className="field-grid">
                    <div className="field static-field">
                      <span>{t.studio.voiceCloneStatus}</span>
                      <strong className={`tone-${asyncTone(selectedHook.voiceCloneStatus)}`}>{asyncStatusLabels[selectedHook.voiceCloneStatus]}</strong>
                      <small>{t.studio.voiceCloneDesc}</small>
                    </div>
                    <div className="field static-field">
                      <span>Audio du hook</span>
                      <strong>{selectedHook.hookAudioUrl ? t.studio.hookAudioExtracted : t.studio.hookAudioNotAvailable}</strong>
                      <small>{selectedHook.hookAudioUrl ? t.studio.hookAudioExtractedDesc : t.studio.hookAudioNotAvailableDesc}</small>
                    </div>
                  </div>

                  {selectedHook.voiceCloneStatus === "processing" ? (
                    <div className="notice-box">
                      <strong>{t.studio.voiceCloneProcessing}</strong>
                      <p>{t.studio.voiceProcessingNotice}</p>
                    </div>
                  ) : null}

                  {selectedHook.voiceCloneStatus === "failed" ? (
                    <div className="notice-box">
                      <strong>{t.studio.voiceCloneFailed}</strong>
                      <p>{t.studio.voiceFailedRetry}</p>
                    </div>
                  ) : null}

                  {selectedHook.hookAudioUrl ? (
                    <article className="asset-stack">
                      <div className="asset-header">
                        <span>{t.studio.hookAudioSource}</span>
                        <a href={selectedHook.hookAudioUrl} rel="noreferrer" target="_blank">
                          {t.common.download}
                        </a>
                      </div>
                      <audio className="audio-preview" controls preload="metadata" src={selectedHook.hookAudioUrl} />
                    </article>
                  ) : null}

                  {selectedHook.voiceoverUrl ? (
                    <article className="asset-stack">
                      <div className="asset-header">
                        <span>{t.studio.voiceoverGenerated}</span>
                        <a href={selectedHook.voiceoverUrl} rel="noreferrer" target="_blank">
                          {t.common.download}
                        </a>
                      </div>
                      <audio className="audio-preview" controls preload="metadata" src={selectedHook.voiceoverUrl} />
                    </article>
                  ) : null}

                  <div className="substep-nav">
                    <button className="secondary-button" onClick={() => goToStep(2)} type="button">
                      {t.studio.backToDemo}
                    </button>
                    <button
                      className="primary-button"
                      disabled={selectedHook.voiceCloneStatus !== "ready" || !selectedDemoId || !demoScript.trim()}
                      onClick={() => goToStep(4)}
                      type="button"
                    >
                      {t.studio.continueToRender}
                    </button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {selectedStep === 4 ? (
            <section className="panel step-panel">
              <div className="panel-header">
                <div>
                  <h2>{t.studio.step4Title}</h2>
                  <p>{t.studio.step4Desc}</p>
                </div>
                <span className={`badge badge-${readyForRender ? "success" : "neutral"}`}>
                  {readyForRender ? t.status.readyToAssemble : t.status.preparationInProgress}
                </span>
              </div>

              {!selectedHook ? (
                <div className="empty-state compact-empty">
                  <h3>{t.studio.noHookSelected}</h3>
                  <p>{t.studio.chooseHookFromStep1}</p>
                </div>
              ) : !selectedDemoId || !demoScript.trim() ? (
                <div className="notice-box">
                  <strong>{t.studio.demoIncomplete}</strong>
                  <p>{t.studio.demoIncompleteDesc}</p>
                </div>
              ) : !readyForRender ? (
                <div className="notice-box">
                  <strong>{t.studio.voiceNotReady}</strong>
                  <p>{t.studio.voiceCheckDesc}</p>
                </div>
              ) : (
                <>
                  <div className="selected-hook-summary">
                    <div className="summary-card">
                      <span>{t.studio.hookVideo}</span>
                      <strong>{selectedHook.videoUrl ? t.status.ready : t.studio.hookAudioNotAvailable}</strong>
                      <p>{selectedHook.videoUrl ? t.studio.hookVideoIntro(selectedHook.seconds) : t.studio.hookVideoNotGenerated}</p>
                    </div>
                    <div className="summary-card">
                      <span>{t.studio.demoChosen}</span>
                      <strong>{selectedDemo?.name ?? t.common.none}</strong>
                      <p>{selectedDemo ? t.studio.demoAudioMuted(formatDuration(selectedDemo.durationSeconds)) : t.studio.noDemoSelected}</p>
                    </div>
                    <div className="summary-card">
                      <span>{t.studio.voiceoverLabel}</span>
                      <strong>{asyncStatusLabels[selectedHook.voiceCloneStatus]}</strong>
                      <p>{selectedHook.voiceoverUrl ? t.studio.voiceoverReadyToAssemble : t.studio.voiceoverWillGenerate}</p>
                    </div>
                    <div className="summary-card">
                      <span>{t.studio.finalMp4}</span>
                      <strong>{asyncStatusLabels[selectedHook.finalVideoStatus]}</strong>
                      <p>
                        {selectedHook.finalVideoUrl ? t.studio.existingRender : t.studio.noFinalRender}
                      </p>
                    </div>
                  </div>

                  <section className="subpanel final-render-panel">
                    <div className="subpanel-header">
                      <div>
                        <h3>{t.studio.launchFinalRender}</h3>
                        <p>{t.studio.launchFinalRenderDesc}</p>
                      </div>
                    </div>

                    <form className="wizard-form" onSubmit={handleFinalizeDemo}>
                      <div className="field-grid">
                        <div className="field static-field">
                          <span>{t.studio.selectedDemo}</span>
                          <strong>{selectedDemo ? selectedDemo.name : t.studio.selectDemo}</strong>
                          <small>
                            {selectedDemo
                              ? t.studio.audioOriginalMuted(formatDuration(selectedDemo.durationSeconds))
                              : t.studio.noDemoSelected}
                          </small>
                        </div>

                        <div className="field static-field">
                          <span>{t.studio.scriptRetained}</span>
                          <strong>{demoScriptFit?.label ?? t.status.ready}</strong>
                          <small>{demoScriptFit?.hint ?? t.studio.scriptDefault}</small>
                        </div>
                      </div>

                      <div className="field static-field">
                        <span>{t.studio.finalScript}</span>
                        <strong>{demoScript}</strong>
                      </div>

                      {!elevenLabsReady ? (
                        <div className="notice-box">
                          <strong>{t.studio.elevenLabsNotConfigured}</strong>
                          <p>{t.studio.elevenLabsRenderBlocked}</p>
                        </div>
                      ) : null}

                      {finalizeError ? <p className="error-inline">{finalizeError}</p> : null}

                      <div className="form-actions">
                        <button className="primary-button" disabled={!canSubmitFinalDemo} type="submit">
                          {finalizingHookId === selectedHook.id ? t.studio.renderInProgress : t.studio.generateFinalMp4}
                        </button>
                        <button className="secondary-button" onClick={() => goToStep(3)} type="button">
                          {t.studio.backToVoice}
                        </button>
                      </div>
                    </form>

                    <div className="asset-columns">
                      {selectedHook.videoUrl ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>{t.studio.hookVideo}</span>
                            <a download href={selectedHook.videoUrl} rel="noreferrer" target="_blank">
                              {t.common.download} MP4
                            </a>
                          </div>
                          <InlineVideoPreview label={t.common.fullscreen} src={selectedHook.videoUrl} />
                        </article>
                      ) : null}

                      {selectedDemo ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>{t.studio.demoChosen}</span>
                            <a download href={selectedDemo.videoUrl} rel="noreferrer" target="_blank">
                              {t.common.download} MP4
                            </a>
                          </div>
                          <InlineVideoPreview label={t.common.fullscreen} src={selectedDemo.videoUrl} />
                        </article>
                      ) : null}

                      {selectedHook.voiceoverUrl ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>{t.studio.voiceoverGenerated}</span>
                            <a download href={selectedHook.voiceoverUrl} rel="noreferrer" target="_blank">
                              {t.common.download} MP3
                            </a>
                          </div>
                          <audio className="audio-preview" controls preload="metadata" src={selectedHook.voiceoverUrl} />
                        </article>
                      ) : null}

                      {selectedHook.hookAudioUrl ? (
                        <article className="asset-stack">
                          <div className="asset-header">
                            <span>{t.studio.hookAudioSource}</span>
                            <a download href={selectedHook.hookAudioUrl} rel="noreferrer" target="_blank">
                              {t.common.download} MP3
                            </a>
                          </div>
                          <audio className="audio-preview" controls preload="metadata" src={selectedHook.hookAudioUrl} />
                        </article>
                      ) : null}
                    </div>

                    {selectedHook.finalVideoUrl ? (
                      <article className="final-video-card">
                        <div className="asset-header">
                          <span>{t.studio.finalMp4}</span>
                          <a href={selectedHook.finalVideoUrl} rel="noreferrer" target="_blank">
                            {t.studio.openMp4}
                          </a>
                        </div>
                        <InlineVideoPreview label={t.common.fullscreen} src={selectedHook.finalVideoUrl} />
                        <p className="final-video-note">
                          {t.studio.newRenderReplace}
                        </p>
                      </article>
                    ) : null}
                  </section>
                </>
              )}
            </section>
          ) : null}
        </div>

        {selectedStep === 1 ? (
        <aside className="panel history-panel">
          <div className="panel-header">
            <div>
              <h2>{t.studio.hookHistory}</h2>
              <p>{t.studio.hookHistoryDesc}</p>
            </div>
            <span className="badge badge-neutral">{t.studio.hooksCount(historyItems.length)}</span>
          </div>

          <div className="history-list">
            {historyItems.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>{t.studio.noHooks}</h3>
                <p>{t.studio.firstHookHint}</p>
              </div>
            ) : (
              historyItems.map((item) => {
                const isPending = item.id.startsWith("pending-");
                const isComplete = item.status === "completed";
                const hookText = copyForHookCard(item);
                const truncatedText = hookText.length > 60 ? `${hookText.slice(0, 60)}…` : hookText;

                if (!isComplete) {
                  return (
                    <article className="history-card history-card-static" key={item.id}>
                      <div className="history-card-head">
                        <span className={`badge badge-${generationTone(item.status)}`}>
                          {hookStatusLabels[item.status]}
                        </span>
                        <small className="history-card-time">{modelLabel(item.model)} · {item.seconds}s</small>
                      </div>
                      <strong>{truncatedText}</strong>
                      {item.status === "queued" || item.status === "in_progress" ? (
                        <div className="progress-rail compact-progress">
                          <div
                            className="progress-bar"
                            style={{ width: `${Math.max(item.progressPercent, isPending ? 8 : 4)}%` }}
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                }

                return (
                  <details
                    className="history-card collapsible-card"
                    key={item.id}
                  >
                    <summary className="history-card-summary">
                      <div className="history-card-head">
                        <span className={`badge badge-${generationTone(item.status)}`}>
                          {hookStatusLabels[item.status]}
                        </span>
                        <small className="history-card-time">{modelLabel(item.model)} · {item.seconds}s</small>
                      </div>
                      <strong>{truncatedText}</strong>
                    </summary>

                    <div className="history-card-body">
                      {item.videoUrl ? (
                        <InlineVideoPreview
                          className="history-video"
                          label={t.common.fullscreen}
                          src={item.videoUrl}
                        />
                      ) : null}

                      <div className="history-card-actions">
                        {isComplete ? (
                          <button
                            className="primary-button compact-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleUseHook(item);
                            }}
                            type="button"
                          >
                            {t.studio.useThisHook}
                          </button>
                        ) : (
                          <span className="badge badge-neutral">{hookStatusLabels[item.status]}</span>
                        )}
                      </div>
                    </div>
                  </details>
                );
              }))
            }
          </div>
        </aside>
        ) : null}
        </div>
      </section>
        ) : null}

        {activeTab === "media" ? (
          <MediaView
            demos={demos}
            items={items}
            loadingDemos={loadingDemos}
            onRefreshDemos={() => void refreshDemoLibrary()}
          />
        ) : null}

        {activeTab === "persona" ? (
          <PersonaView
            onPersonaCreated={() => void refreshPersonaLibrary()}
            personas={personas}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsView
            elevenLabsReady={elevenLabsReady}
            envReady={envReady}
            onLogout={handleLogout}
            userEmail={userEmail}
          />
        ) : null}

      </div>

    </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
