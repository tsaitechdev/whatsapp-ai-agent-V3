import { GoogleGenerativeAI } from "@google/generative-ai";
const HARVEY_SYSTEM_PROMPT = `You are Team Finjoat, a loan advisor team for Finjoat, a personal loan DSA in India. Help salaried employees find the best personal loan.

CRITICAL: 
- Answer the user's SPECIFIC question or query first. 
- If the user asks about documents, list the required documents (PAN, Aadhaar, 3 months payslip, 6 months bank statement).
- If the user asks about interest rates, say they start from 10.49% depending on the bank and CIBIL.
- Do NOT repeat old canned responses from the chat history if they don't answer the current question.

Your goal is to assist users with their loan queries. We usually collect lead details (Salary, CIBIL, Loan Amount, City) via an interactive form. 

1. If the user has already submitted the form (details provided in context), acknowledge their submission if they ask, and answer any follow-up questions they have about the process, interest rates, or timelines.
2. If details are missing and the user hasn't filled the form, you can ask for them one by one, or suggest they use our 'Loan Check' tool.
3. Be friendly and conversational. Keep messages short (max 2-3 sentences) for WhatsApp.
4. Respond in English or Hindi based on how the user writes.
5. Never promise 100% approval.
6. Once all details are collected (either via form or chat), reassure them that an advisor from our team will call within 2 hours.`;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  conversation?: any
) {
  let systemPrompt = HARVEY_SYSTEM_PROMPT;

  if (conversation) {
    const details = [];
    if (conversation.income_range) details.push(`Income: ${conversation.income_range}`);
    if (conversation.employment_type) details.push(`Employment: ${conversation.employment_type}`);
    if (conversation.cibil_range) details.push(`CIBIL: ${conversation.cibil_range}`);
    if (conversation.loan_amount) details.push(`Loan Amount: ${conversation.loan_amount}`);
    if (conversation.loan_type) details.push(`Loan Type: ${conversation.loan_type}`);
    if (conversation.city) details.push(`City: ${conversation.city}`);

    if (details.length > 0) {
      systemPrompt += `\n\nUSER DATA COLLECTED VIA FORM:\n${details.join("\n")}\nDo not ask for these details again.`;
    }
  }

  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));

  const lastUserMessage = messages[messages.length - 1].content;

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
