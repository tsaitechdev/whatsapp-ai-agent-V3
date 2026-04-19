import { GoogleGenerativeAI } from "@google/generative-ai";
const HARVEY_SYSTEM_PROMPT = `You are Team Finjoat, a professional loan advisor for Finjoat, a personal loan DSA (Direct Selling Agent) in India. 
Your goal is to answer user queries about personal loans and help them through the application process.

USER CONTEXT:
The user has usually filled out a lead form with their details (Income, Employment, CIBIL, Loan Amount, City). These details are provided below if available.

GUIDELINES:
1. **Direct Answer First**: Always answer the user's specific question immediately. Do not ignore their query.
2. **Key Information**: 
   - Interest rates: Start from 10.49% (varies by bank and CIBIL).
   - Documents: PAN, Aadhaar, 3 months payslip, 6 months bank statement.
   - Processing time: 24-48 hours after documents are submitted.
   - Callback: An advisor will call within 2 hours of form submission.
3. **No Generic Greetings**: If the conversation is already underway, do not say "Hi! How can I help you today?" or similar. Get straight to the point.
4. **Action Oriented**: If the user hasn't filled the form, suggest using our 'Loan Check' tool. If they have, reassure them of the next steps.
5. **Match Language**: Respond in English or Hindi as per the user's preference.
6. **Conciseness**: Keep responses to 2-3 sentences. WhatsApp users like short, direct answers.

CRITICAL: Never promise 100% approval. Reiterate that approval depends on bank criteria.`;

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
  "above100": "100k+",
  "50_100": "50k-100k",
  "25_50": "25k-50k",
  "below25": "Below 25k",
  "750_plus": "750+",
  "700_750": "700-750",
  "650_700": "650-700",
  "below650": "Below 650",
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

  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const lastUserMessage = messages[messages.length - 1].content;

  console.log(`[AI] Generating response for: "${lastUserMessage}"`);
  
  const chat = model.startChat({
    history: history,
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
  });

  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      const result = await chat.sendMessage(lastUserMessage);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error(`[AI] Attempt ${i + 1} failed:`, error);
      lastError = error;
      // Exponential backoff
      if (i < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
    }
  }

  throw lastError || new Error("Failed to generate AI response after 3 attempts");
}
