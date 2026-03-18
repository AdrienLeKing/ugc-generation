export function getOpenAiApiKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY est manquante. Ajoutez-la dans un fichier .env.local avant de lancer une generation.",
    );
  }

  return apiKey;
}

export function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getElevenLabsApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY est manquante. Ajoutez-la dans un fichier .env.local avant d'utiliser la synthese vocale.",
    );
  }

  return apiKey;
}

export function hasElevenLabsApiKey() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}
