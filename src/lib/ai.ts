import { GoogleGenerativeAI } from "@google/generative-ai";
const HARVEY_SYSTEM_PROMPT = `You are Harvey, a loan advisor for Finjoat,
a personal loan DSA in India. Help salaried employees find the best
personal loan. Qualify leads by asking one question at a time:
1. Monthly take-home salary
2. CIBIL score range (750+, 700-749, 650-699, below 650)
3. Loan amount needed
4. City
Be friendly and conversational. Keep messages short for WhatsApp.
Respond in English or Hindi based on how the user writes.
Never promise specific interest rates.
Once you have all 4 details say: Thank you! Our advisor will call
you within 2 hours with the best loan options for you.`;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
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
    systemInstruction: { role: "system", parts: [{ text: HARVEY_SYSTEM_PROMPT }] },
  });

  const result = await chat.sendMessage(lastUserMessage);
  const response = await result.response;
  return response.text() || "Sorry, I couldn't generate a response.";
}
