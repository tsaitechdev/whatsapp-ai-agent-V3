import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const FLOW_ID = "1084065951453992";

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
  await processWebhook(body);
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

    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      try {
        console.log("[Webhook] Processing flow reply...");
        const flowData = JSON.parse(message.interactive.nfm_reply.response_json);

        // Fetch conversation to get ID
        const { data: conv } = await supabase.from("conversations").select("id").eq("phone", phone).single();

        if (conv) {
          await supabase.from("conversations").update({
            employment_type: flowData.employment_type,
            income_range: flowData.income_range,
            cibil_range: flowData.cibil_range,
            loan_type: flowData.loan_type,
            loan_amount: flowData.loan_amount,
            city: flowData.city,
            timeline: flowData.timeline,
            status: 'qualified',
            qualified_at: new Date().toISOString(),
            flow_data: flowData,
            last_flow_sent: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).eq("id", conv.id);

          // Store the form submission as a message so it appears in the dashboard
          const summary = `Form Submitted: ${flowData.loan_amount} ${flowData.loan_type} in ${flowData.city} (Income: ${flowData.income_range})`;
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            role: "user",
            content: summary,
            whatsapp_msg_id: whatsappMsgId
          });

          const confirmation = `Thanks! We received your ${flowData.loan_amount} ${flowData.loan_type} request for ${flowData.city}. Our advisor will call within 2 hours.`;
          await sendWhatsAppMessage(phone, confirmation);

          // Store the bot's confirmation message
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            role: "assistant",
            content: confirmation
          });
        }
        console.log("[Webhook] PASS: Interactive nfm_reply processed and stored");
      } catch (parseError) {
        console.error("[Webhook] FAIL: Error parsing flow JSON:", parseError);
      }
      return;
    }

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

    if (message.type === 'text') {
      console.log("[Webhook] Processing text message");
      const text = message.text.body;
      const hasReferral = !!value.referral;
      const isGreeting = /^(hi|hello|hey|namaste|hii|helo|hlo|start|good)/.test(text.toLowerCase());
      const isLoanIntent = /(loan|eligib|check|apply|cibil|personal|fund|paisa|amount|lakh)/.test(text.toLowerCase());
      const wantsHuman = /(agent|human|talk|call|executive|person|baat kar)/.test(text.toLowerCase());
      const alreadyQualified = !!conversation.qualified_at;

      console.log(`[Webhook] Intent check: greeting=${isGreeting}, loan=${isLoanIntent}, human=${wantsHuman}, qual=${alreadyQualified}`);

      console.log("[Webhook] Storing user message...");
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: text,
        whatsapp_msg_id: whatsappMsgId,
      });

      if (insertError) {
         if (insertError.code === "23505") {
            console.log("[Webhook] Duplicate message ignored.");
            return;
         } else {
            console.error("[Webhook] FAIL: Error storing user message:", insertError);
         }
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      if (wantsHuman) {
        console.log("[Webhook] User wants human mode");
        await supabase.from("conversations").update({ mode: 'human' }).eq("id", conversation.id);
        await sendWhatsAppMessage(phone, "Sure, connecting you to our advisor. We\'ll call within 10 minutes.");
        return;
      }

      if (conversation.mode === "human") {
        console.log("[Webhook] Human mode active, skipping AI");
        return;
      }

      if (!alreadyQualified && (hasReferral || isGreeting || isLoanIntent)) {
        console.log("[Webhook] Triggering flow...");
        await supabase.from("conversations").update({
          last_flow_sent: new Date().toISOString()
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
          conversation // Pass the conversation context
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
         console.error("[Webhook] AI error after retries:", aiError);
         // Send a graceful fallback message
         const fallbackMessage = "I'm sorry, I'm experiencing a bit of high demand right now. Could you please try again in a moment? Or if you'd like, I can connect you to an advisor.";
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