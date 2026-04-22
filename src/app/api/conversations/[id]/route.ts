import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

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
  if (body.internal_notes !== undefined) updateData.internal_notes = body.internal_notes;
  if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to;
  if (body.follow_up_at !== undefined) updateData.follow_up_at = body.follow_up_at;
  if (body.is_hot_lead !== undefined) updateData.is_hot_lead = body.is_hot_lead;

  const { data, error } = await supabase
    .from("conversations")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
