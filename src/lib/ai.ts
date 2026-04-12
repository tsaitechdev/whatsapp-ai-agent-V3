import { GoogleGenerativeAI } from "@google/generative-ai";
import { DENTIST_SYSTEM_PROMPT } from "@/lib/system-prompt";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const lastUserMessage = messages[messages.length - 1].content;

  const chat = model.startChat({
    history: history,
    systemInstruction: { parts: [{ text: DENTIST_SYSTEM_PROMPT }] },
  });

  const result = await chat.sendMessage(lastUserMessage);
  const response = await result.response;
  return response.text() || "Sorry, I couldn't generate a response.";
}
