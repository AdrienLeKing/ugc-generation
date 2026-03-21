export type HookShotPresetId =
  | "selfie_handheld"
  | "phone_front_fixed"
  | "phone_off_axis"
  | "custom";

export type HookScenePresetId =
  | "indoor_home"
  | "kitchen"
  | "bathroom"
  | "car"
  | "outdoor"
  | "custom";

export type HookShotPreset = {
  id: HookShotPresetId;
  name: string;
  badge: string;
  summary: string;
  shootingContext: string;
  promptDirectives: string[];
};

export type HookScenePreset = {
  id: HookScenePresetId;
  name: string;
  badge: string;
  summary: string;
  sceneStarter: string;
  promptDirectives: string[];
};

export const HOOK_SHOT_PRESETS: HookShotPreset[] = [
  {
    id: "selfie_handheld",
    name: "Selfie a la main",
    badge: "UGC brut",
    summary:
      "Telephone tenu en main avec la camera frontale, legeres vibrations naturelles, petites micro-corrections de cadrage et rendu smartphone tres credible.",
    shootingContext:
      "Ideal pour une accroche tres incarnee, spontanee et proche des codes TikTok ou Reels.",
    promptDirectives: [
      "Film with the front iPhone camera held in the creator's hand at arm's length.",
      "Keep realistic hand shake, imperfect stabilization, slight rolling shutter, and tiny autofocus breathing.",
      "Frame like a real moving selfie video: head and upper torso, slightly imperfect centering, natural micro-reframes.",
      "Preserve an authentic native-phone feel, not a polished commercial camera look.",
    ],
  },
  {
    id: "phone_front_fixed",
    name: "Telephone pose face a soi",
    badge: "Face cam",
    summary:
      "Telephone pose ou appuye devant la creatrice, image globalement stable mais pas trop propre, avec legeres imperfections d'un vrai smartphone.",
    shootingContext:
      "Utile pour les hooks face camera plus lisibles, routines, temoignages et formats produit.",
    promptDirectives: [
      "Film with a smartphone resting on a simple support directly facing the creator.",
      "Keep the framing mostly stable but retain slight focus hunts and subtle phone imperfections.",
      "Use a believable native phone composition rather than a studio-perfect framing.",
    ],
  },
  {
    id: "phone_off_axis",
    name: "Telephone cale legerement de cote",
    badge: "Temoignage",
    summary:
      "Telephone pose avec un angle un peu decale, composition moins parfaite, sensation de capture rapide et tres amateur credible.",
    shootingContext:
      "Bon pour un ton conversationnel, comme si la personne parlait a une amie sans mise en scene lourde.",
    promptDirectives: [
      "Film with a smartphone propped on an improvised support at a slight off-axis angle.",
      "Keep the camera slightly imperfect and casually framed rather than perfectly centered.",
      "Include gentle framing imperfections, minor focus breathing, and a believable amateur setup.",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    badge: "Libre",
    summary:
      "Prise de vue libre pour decrire toi-meme la facon dont le telephone est tenu, pose ou cadre.",
    shootingContext: "A utiliser quand aucun mode de prise de vue ne correspond.",
    promptDirectives: [
      "Follow the custom camera-handling direction precisely while keeping the result realistic, UGC-native, and smartphone credible.",
    ],
  },
];

export const HOOK_SCENE_PRESETS: HookScenePreset[] = [
  {
    id: "indoor_home",
    name: "Indoor maison",
    badge: "Maison",
    summary:
      "Decor du quotidien a la maison, lumiere domestique simple, ambiance naturelle et vecue.",
    sceneStarter:
      "Creatrice dans un interieur de maison naturel, type salon, chambre ou couloir, avec lumiere domestique simple et ambiance quotidienne.",
    promptDirectives: [
      "Set the scene inside a believable lived-in home interior.",
      "Use simple domestic light, everyday textures, and a casual at-home atmosphere.",
    ],
  },
  {
    id: "kitchen",
    name: "Cuisine",
    badge: "Routine",
    summary:
      "Cuisine ou piece de vie lumineuse, plan de travail visible, ambiance maison naturelle.",
    sceneStarter:
      "Creatrice dans une cuisine ou piece de vie lumineuse, ambiance maison naturelle, decor credible du quotidien.",
    promptDirectives: [
      "Place the creator in a believable kitchen or open living area.",
      "Use soft domestic light and an everyday lived-in environment.",
    ],
  },
  {
    id: "bathroom",
    name: "Salle de bain",
    badge: "Beauty",
    summary:
      "Salle de bain lumineuse, proximite visage, ambiance routine beaute tres credible.",
    sceneStarter:
      "Creatrice dans une salle de bain lumineuse, proche du lavabo ou du miroir, ton naturel et proche camera.",
    promptDirectives: [
      "Set the scene in a realistic bathroom with believable sink, mirror, and beauty-routine cues.",
      "Keep the environment intimate and product-demo friendly.",
    ],
  },
  {
    id: "car",
    name: "Voiture",
    badge: "Voiture",
    summary:
      "Habitacle de voiture credible, lumiere du jour passant par le pare-brise, ambiance confessionnelle ou avis a chaud.",
    sceneStarter:
      "Creatrice dans une voiture, habitacle naturel, lumiere du jour au travers du pare-brise, ambiance intime et credible.",
    promptDirectives: [
      "Set the scene inside a believable car cabin with windshield daylight and subtle interior shadows.",
      "Maintain a casual in-car UGC feel rather than a polished automotive commercial.",
    ],
  },
  {
    id: "outdoor",
    name: "Outdoor",
    badge: "Exterieur",
    summary:
      "Exterieur du quotidien, trottoir, rue calme ou parc, lumiere naturelle et ambiance vivante.",
    sceneStarter:
      "Creatrice en exterieur du quotidien, type rue calme, trottoir ou parc, avec lumiere naturelle et ambiance reelle.",
    promptDirectives: [
      "Place the creator in a believable everyday outdoor environment such as a sidewalk, quiet street, or park.",
      "Use natural daylight, subtle background depth, and real-world ambient motion.",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    badge: "Libre",
    summary:
      "Scene libre pour decrire toi-meme le lieu, la lumiere, le contexte et l'ambiance.",
    sceneStarter: "",
    promptDirectives: [
      "Follow the custom scene direction precisely while keeping the result realistic, UGC-native, and smartphone credible.",
    ],
  },
];

export const DEFAULT_HOOK_SHOT_PRESET_ID: HookShotPresetId = "selfie_handheld";
export const DEFAULT_HOOK_SCENE_PRESET_ID: HookScenePresetId = "indoor_home";

export function getHookShotPreset(presetId?: string | null) {
  return HOOK_SHOT_PRESETS.find((preset) => preset.id === presetId) ?? HOOK_SHOT_PRESETS[0];
}

export function getHookScenePreset(presetId?: string | null) {
  return HOOK_SCENE_PRESETS.find((preset) => preset.id === presetId) ?? HOOK_SCENE_PRESETS[0];
}

export function isCustomHookShotPreset(presetId?: string | null) {
  return presetId === "custom";
}

export function isCustomHookScenePreset(presetId?: string | null) {
  return presetId === "custom";
}

export function getDefaultSceneDescription(scenePresetId?: string | null) {
  return getHookScenePreset(scenePresetId).sceneStarter;
}

export function buildHookPrompt(input: {
  spokenText: string;
  sceneDescription: string;
  shotPresetId?: string | null;
  scenePresetId?: string | null;
  hasReferenceImage?: boolean;
  useReferenceScene?: boolean;
}) {
  const shotPreset = getHookShotPreset(input.shotPresetId);
  const scenePreset = getHookScenePreset(input.scenePresetId);

  return [
    input.hasReferenceImage
      ? "Create a short vertical 9:16 UGC hook video using the provided reference image as the exact identity of the speaking creator."
      : "Create a short vertical 9:16 UGC hook video of a believable creator speaking directly to camera.",
    input.hasReferenceImage
      ? "Keep the face consistent with the reference image and frame the creator speaking directly to camera."
      : "Frame the creator speaking directly to camera with a realistic smartphone-native look.",
    input.hasReferenceImage && input.useReferenceScene
      ? "The reference image can also influence the lighting, ambiance, and environmental feel when it stays compatible with the chosen scene."
      : "Use the reference image only for the creator identity. Do not copy the photo background or location unless it naturally matches the selected scene.",
    `The creator must say exactly this line with clear lip sync and natural speaking rhythm: "${input.spokenText}"`,
    `Camera handling preset: ${shotPreset.name}. ${shotPreset.summary}`,
    `Scene preset: ${scenePreset.name}. ${scenePreset.summary}`,
    `Shot context and scene details: ${input.sceneDescription}`,
    `Extra realism notes: ${shotPreset.shootingContext}`,
    ...shotPreset.promptDirectives,
    ...scenePreset.promptDirectives,
    input.useReferenceScene
      ? "Blend the selected scene with subtle compatible atmosphere cues from the reference image, while keeping the creator identity consistent."
      : "The selected scene takes priority over any background visible in the reference image.",
    "Keep the pacing hook-first, realistic, smartphone-native, and focused on the creator delivering the line.",
  ].join("\n");
}
