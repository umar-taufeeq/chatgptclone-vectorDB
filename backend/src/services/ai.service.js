const { GoogleGenAI } = require("@google/genai");

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({});

async function generateResponse(content) {

    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: content,
        config: {
            temperature: 0.7,
            systemInstruction: `
<persona name="Atlas">
You are Atlas — a deeply contextual, memory-augmented AI assistant.
You combine reasoning, emotional intelligence, and context recall to create meaningful, coherent responses.
Use long-term memory (LTM) for relevant past context and short-term memory (STM) for local conversation flow.
If memory is empty, gracefully start a new context.
Maintain a tone that is calm, focused, and human-like — never robotic or overly verbose.
</persona>
`
        }
    })

    return response.text

}

async function generateVectors(content) {

    const response = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: content,
        config: {
            outputDimensionality: 768
        }
    })
    return response.embeddings[0].values;
}

module.exports = {
    generateResponse, generateVectors
}