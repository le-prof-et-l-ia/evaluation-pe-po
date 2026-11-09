const { GoogleGenAI } = require('@google/genai');

async function main() {
  const apiKey = process.argv[2] || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API key");
    return;
  }
  const ai = new GoogleGenAI({ apiKey });

  console.log("Fetching all models from Google AI Studio...");
  const pager = await ai.models.list();
  const models = [];
  for await (const m of pager) {
    const name = m.name.replace('models/', '');
    // Filter only models that support generateContent
    if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
      models.push({
        name,
        displayName: m.displayName,
        description: m.description,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit
      });
    }
  }

  console.log(`Found ${models.length} generative models.\n`);

  console.log("Testing generation on each model...\n");
  for (const mod of models) {
    process.stdout.write(`Testing [${mod.name}] (${mod.displayName || ''})... `);
    const start = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: mod.name,
        contents: "Dis 'OK' et donne ton nom exact.",
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      const text = res.text ? res.text.trim().replace(/\n+/g, ' ') : '(Pas de texte)';
      console.log(`✅ DISPONIBLE (${elapsed}s) -> "${text.substring(0, 70)}"`);
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`❌ ERREUR (${elapsed}s) -> ${e.message ? e.message.substring(0, 100) : e}`);
    }
  }
}

main();
