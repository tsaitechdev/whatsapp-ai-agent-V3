import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const FLOW_ID = "1084065951453992";

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

async function sendFlow(to: string) {
  if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    console.error("[sendFlow] FAIL: Missing configuration (PHONE_NUMBER_ID or WHATSAPP_TOKEN)");
    return;
  }

  try {
    console.log(`[sendFlow] Sending flow to ${to}...`);
    const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: 'Finjoat Loan Check' },
          body: { text: 'Check eligibility from 12 banks in 60 seconds' },
          footer: { text: 'Takes less than 1 minute' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_id: FLOW_ID,
              flow_cta: 'Start'
            }
          }
        }
      })
    });

    const responseText = await response.text();
    if (!response.ok) {
      console.error(`[sendFlow] FAIL: Status ${response.status}:`, responseText);
    } else {
      console.log(`[sendFlow] PASS: Flow sent to ${to}`);
    }
  } catch (error) {
    console.error("[sendFlow] FAIL: Fetch error:", error);
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("Webhook GET request received:");
  console.log("  Mode:", mode);
  console.log("  Token from Meta:", token);
  console.log("  Challenge:", challenge);

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  console.log("=== START ===", new Date().toISOString());

  const WEBHOOK_SECRET = process.env.WHATSAPP_APP_SECRET || "";
  const signature = request.headers.get("X-Hub-Signature-256");
  
  if (!signature) {
    console.log("FAIL: No signature header");
    return new Response("Invalid", { status: 403 });
  }

  const rawBody = await request.text();

  const [algo, hash] = signature.split("=");
  
  if (!algo || !hash) {
    console.log("FAIL: Malformed signature header");
    return new Response("Invalid", { status: 403 });
  }

  const hmac = crypto.createHmac(algo, WEBHOOK_SECRET);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");

  try {
    if (hash.length !== digest.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(digest))) {
      console.log("FAIL: Bad signature");
      return new Response("Invalid", { status: 403 });
    }
  } catch (e) {
    console.log("FAIL: Signature comparison error", e);
    return new Response("Invalid", { status: 403 });
  }

  const body = JSON.parse(rawBody);
  console.log("Object:", body.object);

  if (body.object!== "whatsapp_business_account") {
    console.log("FAIL: Wrong object");
    return Response.json({ status: "ignored" });
  }

  console.log("PASS: Signature and object verified. Processing webhook.");
  
  // Use fire-and-forget for processing to respond to Meta immediately and prevent retries
  // We don't await processWebhook here.
  processWebhook(body).catch(err => console.error("[Webhook] Background processing error:", err));
  
  return Response.json({ status: "received" });
}

async function processWebhook(body: any) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.[0]) {
      console.log("SKIP: No messages in webhook payload");
      return;
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    console.log(`[Webhook] Type: ${message.type}, From: ${message.from}, ID: ${message.id}`);

    const phone = message.from;
    const name = contact?.profile?.name || null;
    const whatsappMsgId = message.id;

    // 1. Fetch or create conversation first so it's available for all message types
    console.log("[Webhook] Fetching/creating conversation...");
    let { data: conversation, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (convoError && convoError.code !== 'PGRST116') {
      console.error("[Webhook] FAIL: Error fetching conversation:", convoError);
    }

    if (!conversation) {
      console.log("[Webhook] Creating new conversation...");
      const { data: newConvo, error: insertConvoError } = await supabase
        .from("conversations")
        .insert({ phone, name })
        .select()
        .single();
        
      if (insertConvoError) {
         console.error("[Webhook] FAIL: Error creating conversation:", insertConvoError);
         return;
      }
      conversation = newConvo;
    } else if (name && name !== conversation.name) {
      await supabase
        .from("conversations")
        .update({ name })
        .eq("id", conversation.id);
    }

    if (!conversation) {
      console.log("[Webhook] FAIL: No conversation available.");
      return; 
    }

    // 2. Handle Flow Reply (nfm_reply)
    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      try {
        console.log("[Webhook] Processing flow reply...");
        
        // Check for duplicate processing of the same message ID
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("whatsapp_msg_id", whatsappMsgId)
          .single();
        
        if (existingMsg) {
          console.log("[Webhook] Duplicate flow reply ignored.");
          return;
        }

        const flowData = JSON.parse(message.interactive.nfm_reply.response_json);
        console.log("[Webhook] Flow Data Received:", JSON.stringify(flowData));

        console.log(`[Webhook] Updating conversation ${conversation.id} with flow data...`);
        const { error: updateError } = await supabase.from("conversations").update({
          employment_type: flowData.employment_type || flowData.employment,
          income_range: flowData.income_range || flowData.income,
          cibil_range: flowData.cibil_range || flowData.cibil,
          loan_type: flowData.loan_type || flowData.type,
          loan_amount: flowData.loan_amount || flowData.amount,
          city: flowData.city,
          timeline: flowData.timeline,
          qualified_at: new Date().toISOString(),
          flow_data: flowData,
          updated_at: new Date().toISOString()
        }).eq("id", conversation.id);

        if (updateError) {
          console.error("[Webhook] FAIL: Error updating conversation with flow data:", updateError);
        } else {
          console.log("[Webhook] PASS: Conversation updated with flow data");
        }

        // Store the form submission summary for the dashboard
        const amount = formatValue(flowData.loan_amount || flowData.amount);
        const type = formatValue(flowData.loan_type || flowData.type);
        const city = flowData.city || "N/A";
        const income = formatValue(flowData.income_range || flowData.income);

        const summary = `Form Submitted: ${amount} ${type} in ${city} (Income: ${income})`;
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "user",
          content: summary,
          whatsapp_msg_id: whatsappMsgId
        });

        const confirmation = `Thanks! We've received your ${amount} ${type} request for ${city}. An advisor from Team Finjoat will call you within 2 hours.`;
        await sendWhatsAppMessage(phone, confirmation);

        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: confirmation
        });

        console.log("[Webhook] PASS: Interactive nfm_reply processing complete");
      } catch (parseError) {
        console.error("[Webhook] FAIL: Error parsing flow JSON:", parseError);
      }
      return;
    }

    // 3. Handle Text Message
    if (message.type === 'text') {
      console.log("[Webhook] Processing text message");
      const text = message.text.body;
      const hasReferral = !!value.referral;
      const lowerText = text.toLowerCase();
      
      const isGreeting = /^(hi|hello|hey|namaste|hii|helo|hlo|good|morning|afternoon|evening)/.test(lowerText);
      const isStart = /^(start|apply|check|loan|eligib)/.test(lowerText);
      const isLoanIntent = /(loan|eligib|check|apply|cibil|personal|fund|paisa|amount|lakh)/.test(lowerText);
      const wantsHuman = /(agent|human|talk|call|executive|person|baat kar)/.test(lowerText);

      // Reset alreadyQualified check by fetching the latest state
      const { data: latestConvo } = await supabase.from("conversations").select("qualified_at, mode, updated_at, income_range, employment_type, cibil_range, loan_amount, loan_type, city").eq("id", conversation.id).single();
      const isActuallyQualified = !!latestConvo?.qualified_at;

      console.log(`[Webhook] State: qual=${isActuallyQualified}, mode=${latestConvo?.mode}, text="${text}"`);

      console.log("[Webhook] Storing user message...");
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: text,
        whatsapp_msg_id: whatsappMsgId,
      });

      if (insertError) {
         if (insertError.code === "23505") {
            console.log("[Webhook] Duplicate message ID ignored.");
            return;
         } else {
            console.error("[Webhook] FAIL: Error storing user message:", insertError);
         }
      }

      // Check if we already responded to this EXACT message content recently to prevent duplicates from different message IDs
      const { data: recentMsg } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("content", text)
        .eq("role", "user")
        .neq("whatsapp_msg_id", whatsappMsgId)
        .gt("created_at", new Date(Date.now() - 5000).toISOString())
        .limit(1);

      if (recentMsg && recentMsg.length > 0) {
        console.log("[Webhook] Duplicate message content within 5s ignored.");
        return;
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      if (wantsHuman) {
        console.log("[Webhook] User wants human mode");
        await supabase.from("conversations").update({ mode: 'human' }).eq("id", conversation.id);
        await sendWhatsAppMessage(phone, "Sure, connecting you to our advisor from Team Finjoat. We'll call within 10 minutes.");
        return;
      }

      if (latestConvo?.mode === "human") {
        console.log("[Webhook] Human mode active, sending auto-reply...");
        const isQuery = /(where|are you|hello|hi|advisor|talk|call|when)/.test(lowerText);
        if (isQuery) {
          await sendWhatsAppMessage(phone, "Our advisor is reviewing your details and will connect with you shortly. Thank you for your patience!");
        }
        return;
      }

      // Trigger flow if not qualified OR if it's a greeting/start/loan intent and the previous data is old
      const lastUpdate = new Date(latestConvo?.updated_at || 0).getTime();
      const isOldSession = Date.now() - lastUpdate > 12 * 60 * 60 * 1000; // 12 hours

      if ((!isActuallyQualified || isOldSession) && (hasReferral || isGreeting || isStart)) {
        console.log("[Webhook] Triggering flow and resetting lead data...");
        await supabase.from("conversations").update({
          income_range: null,
          employment_type: null,
          cibil_range: null,
          loan_amount: null,
          loan_type: null,
          city: null,
          timeline: null,
          flow_data: null,
          qualified_at: null,
          mode: 'ai',
          last_flow_sent: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", conversation.id);
        
        await sendFlow(phone);
        return;
      }

      console.log("[Webhook] Getting AI response...");
      try {
        const { data: history, error: historyError } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(20);

        if (historyError) console.error("[Webhook] History fetch error:", historyError);

        const aiResponse = await getAIResponse(
          (history || []).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          latestConvo // Pass the latest conversation context
        );
        
        console.log("[Webhook] Sending AI response...");
        await sendWhatsAppMessage(phone, aiResponse);

        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: aiResponse,
        });

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conversation.id);
          
        console.log("[Webhook] SUCCESS");

      } catch (aiError) {
         console.error("[Webhook] AI error:", aiError);
         const fallbackMessage = "I'm sorry, I'm experiencing a bit of high demand. Could you please try again? Or I can connect you to an advisor.";
         await sendWhatsAppMessage(phone, fallbackMessage);
      }

    } else {
      console.log(`[Webhook] Unhandled message type: ${message.type}`);
      return;
    }

  } catch (error) {
    console.error("[Webhook] Critical error:", error);
  }
}