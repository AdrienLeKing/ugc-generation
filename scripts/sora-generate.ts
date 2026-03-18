import process from "node:process";

import { DEFAULT_DURATION_SECONDS } from "../src/lib/sora/config";

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
  npm run sora -- --spoken "Texte prononcé" --scene "Scène et settings" [--image /chemin/image.jpg] [--seconds ${DEFAULT_DURATION_SECONDS}] [--model sora-2]

Exemples:
  npm run sora -- --spoken "Stop, si ta peau tiraille apres la douche..." --scene "Face camera, salle de bain lumineuse, ton naturel" --image "/Users/adrien/image.jpg"
  npm run sora -- --spoken "Je te montre pourquoi j'ai garde ca dans ma routine." --scene "Selfie main, lumiere du matin, ton naturel" --model sora-2
  npm run sora -- --spoken "J'ai teste ca pendant 7 jours." --scene "Cuisine claire, leger mouvement smartphone, energie UGC premium" --image "/Users/adrien/image.jpg" --seconds 12 --model sora-2-pro
`);
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    printHelp();
    return;
  }

  const spokenText = readArgument("--spoken");
  const sceneDescription = readArgument("--scene");

  if (!spokenText || !sceneDescription) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const { createGenerationsFromCli } = await import("../src/lib/sora/service");

  const result = await createGenerationsFromCli({
    spokenText,
    sceneDescription,
    model: readArgument("--model"),
    seconds: Number(readArgument("--seconds") || DEFAULT_DURATION_SECONDS),
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
