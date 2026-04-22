import { GoogleGenerativeAI } from "@google/generative-ai";
const HARVEY_SYSTEM_PROMPT = `You are Team Finjoat, a professional personal loan advisor for Finjoat in India. 

Your goal is to answer user queries concisely and directly. 

GUIDELINES:
1. **Direct Answer Only**: Answer the user's specific question immediately. Do not provide unasked information (e.g., do not give interest rates unless the user asks for them).
2. **Key Information (Use only when asked)**: 
   - Interest rates: Start from 10.49%.
   - Documents: PAN, Aadhaar, 3 months payslip, 6 months bank statement.
   - Processing: 24-48 hours after documents are received.
   - Advisor callback: Within 2 hours of form submission.
3. **No Redundancy**: If the user has just submitted a form, do not say "Thanks for sharing all the details" (the system already did that). Just answer their next question.
4. **WhatsApp Style**: Keep responses to 1-2 short sentences. Avoid paragraphs.
5. **Language**: Respond in English or Hindi as per the user's lead.
6. **No Specific Hallucinations**: Never promise a specific time for a call (like "Tomorrow at 11 AM"). Stick to "Within 2 hours" or "Shortly".
7. **Surgical Disclaimers**: Do NOT repeat the "Final approval depends on bank criteria" disclaimer in every message. Only mention it once if the user asks about approval or eligibility.

If the user is waiting for an advisor, reassure them they will be called shortly.`;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

const KEY_MAP: Record<string, string> = {
  "10_20": "10-20 Lakhs",
  "5_10": "5-10 Lakhs",
  "3_5": "3-5 Lakhs",
  "below5": "Below 5 Lakhs",
  "above20": "Above 20 Lakhs",
  "bt": "Balance Transfer",
  "pl": "Personal Loan",
  "hl": "Home Loan",
  "lap": "Loan Against Property",
  "topup": "Top-up Loan",
  "salaried": "Salaried",
  "self_employed": "Self Employed",
  "sep": "Self Employed Prof.",
  "above100": "100k+",
  "50_100": "50k-100k",
  "25_50": "25k-50k",
  "below25": "Below 25k",
  "750_plus": "750+",
  "700_750": "700-750",
  "650_700": "650-700",
  "below650": "Below 650",
  "unknown": "Not Sure",
  "immediate": "Immediate",
  "3days": "Within 3 Days",
  "7days": "Within 7 Days",
};

function formatValue(val: any): string {
  if (val === undefined || val === null) return "N/A";
  const str = String(val).toLowerCase();
  return KEY_MAP[str] || String(val);
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  conversation?: any
) {
  let systemPrompt = HARVEY_SYSTEM_PROMPT;

  if (conversation) {
    const details = [];
    if (conversation.income_range) details.push(`Income: ${formatValue(conversation.income_range)}`);
    if (conversation.employment_type) details.push(`Employment: ${formatValue(conversation.employment_type)}`);
    if (conversation.cibil_range) details.push(`CIBIL: ${formatValue(conversation.cibil_range)}`);
    if (conversation.loan_amount) details.push(`Loan Amount: ${formatValue(conversation.loan_amount)}`);
    if (conversation.loan_type) details.push(`Loan Type: ${formatValue(conversation.loan_type)}`);
    if (conversation.city) details.push(`City: ${conversation.city}`);

    if (details.length > 0) {
      systemPrompt += `\n\nUSER DATA COLLECTED VIA FORM (Do not ask for these again):\n${details.join("\n")}`;
    }
  }

  const rawHistory = messages.slice(0, -1).map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  // Google Generative AI requires history to start with 'user' role.
  // If the first message is from 'model', we must remove it.
  let history = rawHistory;
  while (history.length > 0 && history[0].role !== "user") {
    history.shift();
  }

  const lastUserMessage = messages[messages.length - 1].content;

  console.log(`[AI] Generating response for: "${lastUserMessage}"`);
  
  let lastError;
  const modelsToTry = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemini-2.5-flash"];
  
  // Outer loop to try the whole sequence again if needed (Total 2 full rotations)
  for (let rotation = 0; rotation < 2; rotation++) {
    for (const modelName of modelsToTry) {
      // Try each model up to 3 times
      for (let i = 0; i < 3; i++) {
        try {
          const currentModel = genAI.getGenerativeModel({ model: modelName });
          const chat = currentModel.startChat({
            history: history,
            systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
          });

          console.log(`[AI] Attempting ${modelName} (Rotation ${rotation + 1}, Try ${i + 1})...`);
          const result = await chat.sendMessage(lastUserMessage);
          const response = await result.response;
          return response.text();
        } catch (error: any) {
          console.error(`[AI] ${modelName} fail (Rot ${rotation + 1}, Try ${i + 1}):`, error.message);
          lastError = error;
          
          // If it's a 503 or 429, wait a bit before retrying the same model
          if (error.message?.includes("503") || error.message?.includes("429")) {
            if (i < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
              continue;
            }
          }
          // If it's another error or we already tried 3 times, move to next model
          break;
        }
      }
    }
  }

  throw lastError || new Error("Failed to generate AI response after trying all available models");
}
