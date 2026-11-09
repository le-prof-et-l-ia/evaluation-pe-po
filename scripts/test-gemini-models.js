/**
 * Script de test complet des modèles Gemini disponibles avec une clé API Google AI Studio (Free Tier)
 * Usage: node scripts/test-gemini-models.js [VOTRE_CLE_API]
 */

const { GoogleGenAI } = require('@google/genai');

const MODELS_TO_TEST = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Production & OCR)' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite (Ultra Rapide)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Dernière génération)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemma-3-27b-it', label: 'Gemma 3 27B IT (Open Model)' },
  { id: 'gemma-3-12b-it', label: 'Gemma 3 12B IT (Open Model)' },
  { id: 'gemma-3-4b-it', label: 'Gemma 3 4B IT (Open Model)' }
];

async function runTests() {
  const apiKey = process.argv[2] || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  console.log("================================================================================");
  console.log("🔍 TEST COMPLET DES MODÈLES GEMINI AVEC VOTRE CLÉ API");
  console.log("================================================================================\n");

  if (!apiKey) {
    console.log("⚠️ Aucune clé API fournie.");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  const maskedKey = apiKey.substring(0, 8) + "..." + apiKey.slice(-4);
  console.log(`🔑 Clé testée : ${maskedKey}\n`);

  // 1. Lister les modèles disponibles via l'API
  console.log("📋 Récupération de la liste des modèles accessibles depuis l'API...");
  try {
    const listResult = await ai.models.list();
    const modelNames = [];
    for await (const m of listResult) {
      modelNames.push(m.name.replace('models/', ''));
    }
    console.log(`✅ ${modelNames.length} modèles détectés au total sur votre compte API.\n`);
  } catch (e) {
    console.log(`⚠️ Impossible de lister les modèles (erreur: ${e.message || e})\n`);
  }

  // 2. Tester la génération de contenu pour chaque modèle cible
  console.log("🧪 Test d'exécution / génération en direct pour chaque modèle :\n");

  const results = [];

  for (const item of MODELS_TO_TEST) {
    process.stdout.write(`⏳ Test de [${item.label}] (${item.id})... `);
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: item.id,
        contents: "Bonjour ! Réponds par 'Opérationnel' en précisant ton nom de modèle.",
      });

      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      const text = response.text ? response.text.trim().replace(/\n+/g, ' ') : 'Réponse reçue sans texte';
      console.log(`\x1b[32m✅ SUCCÈS\x1b[0m (${elapsed}s)`);
      console.log(`   └─ Réponse : "${text.substring(0, 100)}..."\n`);
      results.push({ ...item, status: 'SUCCESS', elapsed, response: text });
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      const errMsg = err.message || JSON.stringify(err);
      console.log(`\x1b[31m❌ INDISPONIBLE / ERREUR\x1b[0m (${elapsed}s)`);
      console.log(`   └─ Erreur : ${errMsg}\n`);
      results.push({ ...item, status: 'FAILED', elapsed, error: errMsg });
    }
  }

  console.log("================================================================================");
  console.log("📊 BILAN RÉCAPITULATIF :");
  console.log("================================================================================");
  results.forEach(r => {
    const statusIcon = r.status === 'SUCCESS' ? '✅ DISPONIBLE  ' : '❌ INDISPONIBLE';
    console.log(`${statusIcon} | ${r.id.padEnd(24)} | ${r.elapsed}s | ${r.label}`);
  });
  console.log("================================================================================\n");
}

runTests();
