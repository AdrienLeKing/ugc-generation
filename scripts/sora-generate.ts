import process from "node:process";

import { createGenerationsFromCli } from "../src/lib/sora/service";

function readArgument(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function printHelp() {
  console.log(`
Commande:
  npm run sora -- --prompt "Votre prompt" [--seconds 8] [--size 720x1280] [--count 3] [--model sora-2] [--image /chemin/image.jpg]

Exemples:
  npm run sora -- --prompt "UGC skincare, lumiere douce, plan smartphone naturel"
  npm run sora -- --prompt "Plan detaille d'un coffee setup premium" --seconds 12 --count 3 --image "/Users/adrien/image.jpg"
`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }

  const prompt = readArgument("--prompt");

  if (!prompt) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const result = await createGenerationsFromCli({
    prompt,
    model: readArgument("--model"),
    seconds: Number(readArgument("--seconds") || 8),
    size: readArgument("--size"),
    count: Number(readArgument("--count") || 1),
    imagePath: readArgument("--image"),
  });

  console.log(`Generations lancees: ${result.length}`);

  for (const item of result) {
    console.log(`- ${item.id} | ${item.status} | ${item.seconds}s | ${item.size}`);
  }

  console.log("Tableau de bord local: utilisez l'URL affichee par npm run dev, souvent http://localhost:3000");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
