import { supabase } from "./supabase";

export async function logError({
  conversation_id,
  level = "error",
  component,
  message,
  stack,
  metadata,
}: {
  conversation_id?: string;
  level?: "info" | "warn" | "error";
  component: string;
  message: string;
  stack?: string;
  metadata?: any;
}) {
  console.log(`[${component}] ${level.toUpperCase()}: ${message}`);
  
  try {
    await supabase.from("error_logs").insert({
      conversation_id,
      level,
      component,
      message,
      stack,
      metadata,
    });
  } catch (err) {
    console.error("CRITICAL: Failed to save error log to DB:", err);
  }
}
