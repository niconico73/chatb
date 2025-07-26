require('dotenv').config();
const { OpenAI } = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function probarGPT() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Puedes usar "gpt-4o", "gpt-4", "gpt-4-0613" o "gpt-3.5-turbo"
      messages: [
        { role: "user", content: "¿Cuántos días tardan en entregar un pedido?" }
      ],
    });

    console.log("✅ Respuesta de GPT:\n", completion.choices[0].message.content);
  } catch (error) {
    console.error("❌ Error al consultar OpenAI:", error.status, error.message);
  }
}

probarGPT();
