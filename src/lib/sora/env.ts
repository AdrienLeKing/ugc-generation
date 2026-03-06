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
