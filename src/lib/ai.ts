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
6. **No Approval Guarantee**: Always mention approval depends on bank criteria.

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
