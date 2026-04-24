import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { logError } from "@/lib/logger";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (body.mode && !["agent", "human"].includes(body.mode)) {
    return Response.json({ error: "Invalid mode" }, { status: 400 });
  }

  const updateData: any = {};
  if (body.mode) updateData.mode = body.mode;
  if (body.status) updateData.status = body.status;
  if (body.priority) updateData.priority = body.priority;
  if (body.internal_notes !== undefined) updateData.internal_notes = body.internal_notes || null;
  if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to || null;
  if (body.follow_up_at !== undefined) updateData.follow_up_at = body.follow_up_at || null;
  if (body.is_hot_lead !== undefined) updateData.is_hot_lead = body.is_hot_lead === true || body.is_hot_lead === "true";

  const { data, error } = await supabase
    .from("conversations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    await logError({
      conversation_id: id,
      component: "api-patch",
      level: "error",
      message: `Failed to update conversation: ${error.message}`,
      metadata: { updateData }
    });
    return Response.json({ error: error.message }, { status: 500 });
  }

  await logError({
    conversation_id: id,
    component: "api-patch",
    level: "info",
    message: `Updated fields: ${Object.keys(updateData).join(", ")}`,
    metadata: { updateData }
  });

  return Response.json(data);
}
