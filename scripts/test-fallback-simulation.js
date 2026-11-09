const { runWithGeminiModelFallback, GEMINI_FLASH_FALLBACK_CHAIN } = require('../src/lib/geminiService');

async function testFallback() {
  console.log("==================================================");
  console.log("🧪 Test de la chaîne de repli Gemini Flash (3.8 -> 3.6)");
  console.log("==================================================\n");

  console.log("Chaîne configurée :", GEMINI_FLASH_FALLBACK_CHAIN);

  const attemptedModels = [];

  // Simule un échec sur 3.8 (Timeout), puis succès sur 3.6
  try {
    const result = await runWithGeminiModelFallback(
      'gemini-3.8-flash',
      async (modelName, apiKey) => {
        attemptedModels.push(modelName);
        console.log(`-> Tentative sur [${modelName}]...`);
        if (modelName === 'gemini-3.8-flash') {
          throw new Error("Timeout d'attente (30s) dépassé sur gemini-3.8-flash.");
        }
        if (modelName === 'gemini-3.6-flash') {
          return { status: "OK", resolvedBy: modelName };
        }
      },
      { freeKeys: ["AIzaSyFakeKeyTest123"] }
    );

    console.log("\n✅ Résultat obtenu avec succès :", result);
    console.log("Modèles successivement appelés :", attemptedModels);
  } catch (err) {
    console.error("❌ Échec inattendu :", err);
  }
}

testFallback();
