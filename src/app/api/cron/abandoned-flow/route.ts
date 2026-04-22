import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  // Security check: Verify Vercel Cron header if needed
  // const authHeader = request.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });

  console.log("[Cron] Checking for abandoned flows...");

  // Find conversations where last_flow_sent is more than 2 hours ago
  // and qualified_at is still null.
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  
  const { data: abandonedLeads, error } = await supabase
    .from("conversations")
    .select("id, phone, last_flow_sent, name")
    .is("qualified_at", null)
    .lt("last_flow_sent", twoHoursAgo)
    .is("mode", "agent"); // Only if bot is still in control

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const lead of abandonedLeads) {
    // Check if we already sent a reminder recently to avoid spamming
    // In a real app, you'd add a 'last_reminder_sent' column.
    
    const message = `Hi ${lead.name || 'there'}! I noticed you started checking your loan eligibility but didn't finish. It takes less than 60 seconds to see offers from 12+ banks. Would you like to continue?`;
    
    await sendWhatsAppMessage(lead.phone, message);
    
    // Update last_flow_sent to "now" so we don't remind again for another 2 hours
    await supabase.from("conversations").update({
      last_flow_sent: new Date().toISOString()
    }).eq("id", lead.id);

    results.push({ phone: lead.phone, status: "reminder_sent" });
  }

  return Response.json({ processed: abandonedLeads.length, details: results });
}
