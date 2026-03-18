export type HookPresetId =
  | "selfie_handheld"
  | "car_dashboard"
  | "car_passenger"
  | "kitchen_counter"
  | "bathroom_counter"
  | "custom";

export type HookPreset = {
  id: HookPresetId;
  name: string;
  badge: string;
  summary: string;
  shootingContext: string;
  sceneStarter: string;
  promptDirectives: string[];
};

export const HOOK_PRESETS: HookPreset[] = [
  {
    id: "selfie_handheld",
    name: "Selfie a la main",
    badge: "UGC brut",
    summary:
      "Telephone tenu en main avec la camera frontale, creatrice en train de marcher, legeres vibrations de pas et stabilisation imparfaite comme une vraie video selfie iPhone.",
    shootingContext:
      "Ideal pour une accroche tres incarnée, spontanee et proche des codes TikTok ou Reels, comme si la creatrice se filmait en se deplacant reellement.",
    sceneStarter:
      "Creatrice en train de marcher, face camera en selfie, telephone dans la main, decor du quotidien, ton spontané, lumiere naturelle ou domestique simple.",
    promptDirectives: [
      "Film with the front iPhone camera held in the creator's hand at arm's length while she is walking.",
      "Keep realistic step vibrations, hand shake, imperfect stabilization, slight rolling shutter, and tiny autofocus breathing.",
      "Frame like a real moving selfie video: head and upper torso, slightly imperfect centering, natural micro-reframes caused by walking.",
      "The creator should feel like she is genuinely moving through space during the take, not standing still.",
      "Preserve an authentic native-phone feel, not a polished commercial camera look.",
    ],
  },
  {
    id: "car_dashboard",
    name: "Telephone pose dans la voiture",
    badge: "Voiture",
    summary:
      "Telephone pose sur le tableau de bord ou fixe simplement dans l'habitacle, avec petites vibrations de voiture et cadrage naturel.",
    shootingContext: "Utile pour les hooks confessionnels, avis a chaud, ou formats 'je vous raconte un truc en voiture'.",
    sceneStarter:
      "Creatrice assise dans une voiture a l'arret ou en circulation lente, telephone pose devant elle, lumiere du jour passant par le pare-brise.",
    promptDirectives: [
      "Film with a smartphone resting on the dashboard or mounted casually inside the car cabin.",
      "Keep the framing mostly fixed but with subtle car vibrations and realistic cabin movement.",
      "Use a believable in-car perspective with windshield daylight, interior shadows, and slight exposure adaptation.",
      "Maintain a native UGC feel as if the creator pressed record quickly before speaking.",
    ],
  },
  {
    id: "car_passenger",
    name: "Telephone cale cote passager",
    badge: "Temoignage",
    summary:
      "Telephone cale sur le siege passager, la console ou un support improvise, avec angle un peu decale et rendu tres amateur credibile.",
    shootingContext: "Bon pour un ton conversationnel, comme si la personne parlait a une amie juste avant de partir.",
    sceneStarter:
      "Creatrice dans une voiture, telephone cale legerement de cote, angle un peu imparfait, ambiance intime et naturelle.",
    promptDirectives: [
      "Film with a smartphone propped on the passenger seat, center console, or another improvised support.",
      "Keep the camera slightly off-axis with a believable amateur angle rather than a perfectly centered composition.",
      "Include gentle cabin shake, focus breathing, and minor framing imperfections.",
      "The result should feel casual, personal, and captured in one quick take inside a real car.",
    ],
  },
  {
    id: "kitchen_counter",
    name: "Telephone pose en cuisine",
    badge: "Routine",
    summary:
      "Telephone pose sur un plan de travail, une tasse ou un support simple, avec image stable mais pas trop pro.",
    shootingContext: "Parfait pour les hooks routine, avant-apres, produit montre a la maison, ou reaction naturelle.",
    sceneStarter:
      "Creatrice dans une cuisine ou piece de vie lumineuse, telephone pose a hauteur du visage, ambiance maison naturelle.",
    promptDirectives: [
      "Film with a smartphone resting on a kitchen counter or a simple improvised stand.",
      "Keep the image mostly stable but retain small focus hunts and slight framing imperfections from a real phone setup.",
      "Use soft domestic light and an everyday lived-in environment.",
      "Make it feel like a genuine at-home UGC take rather than a studio production.",
    ],
  },
  {
    id: "bathroom_counter",
    name: "Telephone pose salle de bain",
    badge: "Beauty",
    summary:
      "Telephone pose pres du lavabo ou du miroir, avec lumiere de salle de bain, proximité visage et rendu routine beauté très credibile.",
    shootingContext: "Adapte aux hooks skincare, makeup, cheveux, hygiene et routine avant-apres.",
    sceneStarter:
      "Creatrice dans une salle de bain lumineuse, telephone pose pres du lavabo ou du miroir, ton naturel et proche camera.",
    promptDirectives: [
      "Film with a smartphone placed near a bathroom sink or mirror at face height.",
      "Keep the framing intimate and product-demo friendly, with realistic bathroom lighting and slight phone autofocus adjustments.",
      "Preserve a casual beauty-routine feel with a native smartphone look.",
      "Avoid polished cinematic motion; this should feel like a believable creator routine clip.",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    badge: "Libre",
    summary:
      "Preset libre pour decrire toi-meme la scene, le contexte, le rythme et les details de tournage que tu veux.",
    shootingContext: "A utiliser quand aucun preset ne correspond a ton hook.",
    sceneStarter: "",
    promptDirectives: [
      "Follow the custom scene direction precisely while keeping the result realistic, UGC-native, and smartphone credible.",
    ],
  },
];

export const DEFAULT_HOOK_PRESET_ID: HookPresetId = "selfie_handheld";

export function getHookPreset(presetId?: string | null) {
  return HOOK_PRESETS.find((preset) => preset.id === presetId) ?? HOOK_PRESETS[0];
}

export function isCustomHookPreset(presetId?: string | null) {
  return presetId === "custom";
}

export function buildHookPrompt(input: {
  spokenText: string;
  sceneDescription: string;
  presetId?: string | null;
  hasReferenceImage?: boolean;
}) {
  const preset = getHookPreset(input.presetId);

  return [
    input.hasReferenceImage
      ? "Create a short vertical 9:16 UGC hook video using the provided reference image as the exact identity of the speaking creator."
      : "Create a short vertical 9:16 UGC hook video of a believable creator speaking directly to camera.",
    input.hasReferenceImage
      ? "Keep the face consistent with the reference image and frame the creator speaking directly to camera."
      : "Frame the creator speaking directly to camera with a realistic smartphone-native look.",
    `The creator must say exactly this line with clear lip sync and natural speaking rhythm: "${input.spokenText}"`,
    `UGC shooting preset: ${preset.name}. ${preset.summary}`,
    `Shot context and scene details: ${input.sceneDescription}`,
    `Extra realism notes: ${preset.shootingContext}`,
    ...preset.promptDirectives,
    "Keep the pacing hook-first, realistic, smartphone-native, and focused on the creator delivering the line.",
  ].join("\n");
}
