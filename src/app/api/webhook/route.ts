import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

const PHONE_NUMBER_ID = "275705968959951";
const FLOW_ID = "1084065951453992";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN!;

async function sendFlow(to: string) {
  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
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

    if (!response.ok) {
      const errorData = await response.text();
      console.error(`FAIL: sendFlow returned status ${response.status}:`, errorData);
    }
  } catch (error) {
    console.error("FAIL: Error executing sendFlow fetch request:", error);
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

  // Acknowledge the webhook immediately to prevent retries
  // Process the webhook asynchronously
  console.log("PASS: Signature and object verified. Processing webhook asynchronously.");
  processWebhook(body);
  return Response.json({ status: "received" });
}

async function processWebhook(body: any) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Only process actual messages (not status updates)
    if (!value?.messages?.[0]) {
      console.log("FAIL: No messages (in processWebhook)");
      return;
    }

    const message = value.messages[0];
    const contact = value.contacts?.[0];

    console.log("Type:", message.type, "From:", message.from, "ID:", message.id, "(in processWebhook)");

    const phone = message.from;
    const name = contact?.profile?.name || null;
    const whatsappMsgId = message.id;

    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      try {
        const flowData = JSON.parse(message.interactive.nfm_reply.response_json);

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
        }).eq("phone", phone);

        await sendWhatsAppMessage(phone,
          `Thanks! We received your ${flowData.loan_amount} ${flowData.loan_type} request for ${flowData.city}. Our advisor will call within 2 hours.`);
        console.log("PASS: Processing interactive nfm_reply message");
      } catch (parseError) {
        console.error("FAIL: Error parsing flow JSON:", parseError);
      }
      return;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ phone, name })
        .select()
        .single();
      conversation = newConvo;
    } else if (name && name !== conversation.name) {
      await supabase
        .from("conversations")
        .update({ name })
        .eq("id", conversation.id);
    }

    if (!conversation) {
      return; // No response needed since this is fire and forget
    }

    if (message.type === 'text') {
      console.log("PASS: Processing text message (in processWebhook)");
      const text = message.text.body;
      const hasReferral = !!value.referral;
      const isGreeting = /^(hi|hello|hey|namaste|hii|helo|hlo|start|good)/.test(text.toLowerCase());
      const isLoanIntent = /(loan|eligib|check|apply|cibil|personal|fund|paisa|amount|lakh)/.test(text.toLowerCase());
      const wantsHuman = /(agent|human|talk|call|executive|person|baat kar)/.test(text.toLowerCase());
      const alreadyQualified = !!conversation.qualified_at;

      // Store user message
      const { error: insertError } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "user",
        content: text,
        whatsapp_msg_id: whatsappMsgId,
      });

      if (insertError?.code === "23505") {
        // Duplicate message, ignore
        return;
      }

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);

      // Human handoff
      if (wantsHuman) {
        await supabase.from("conversations").update({ mode: 'human' }).eq("id", conversation.id);
        await sendWhatsAppMessage(phone, "Sure, connecting you to our advisor. We\'ll call within 10 minutes.");
        return;
      }

      // If mode is 'human' (and they didn't explicitly ask for a human just now), don't auto-reply
      if (conversation.mode === "human") {
        console.log("PASS: Conversation is in human mode, skipping auto-reply.");
        return;
      }

      // Send Flow for new users, ad clicks, greetings, or loan intent
      if (!alreadyQualified && (hasReferral || isGreeting || isLoanIntent)) {
        await supabase.from("conversations").update({
          last_flow_sent: new Date().toISOString()
        }).eq("id", conversation.id);
        await sendFlow(phone);
        return;
      }

      // Otherwise continue to existing Gemini logic
      // Fetch conversation history (last 20 messages for context)
      const { data: history } = await supabase
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
        .limit(20);

      // Get AI response
      const aiResponse = await getAIResponse(
        (history || []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );

      // Send response via WhatsApp
      await sendWhatsAppMessage(phone, aiResponse);

      // Store AI response
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: aiResponse,
      });

      // Update conversation timestamp again
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id);
    } else {
      console.log("FAIL: Not text or interactive message type handled (in processWebhook)");
      return; // For other message types not handled
    }

    return;
  } catch (error) {
    console.error("Webhook error:", error);
  }
}