import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "@/types/auth";
import { authMiddleware } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware); // All chat routes require login

app.get("/contacts", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// Call the RPC function we just created
	const { data, error } = await supabase.rpc("get_student_chat_contacts", {
		student_id_input: user.id,
	});

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	// This returns a clean list of teachers:
	// [ { id: "...", full_name: "Dr. Nanda", role: "teacher" }, ... ]
	return c.json(data);
});

/**
 * GET /api/chat/rooms
 * UI: Populates the main "Chat" tab.
 * Fetches all of a user's existing chat rooms
 * and the *other* participant's info.
 */
app.get("/rooms", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// 1. Simply call the RPC function we created
	const { data, error } = await supabase.rpc("get_user_chat_rooms", {
		user_id_input: user.id,
	});

	if (error) {
		return c.json({ error: error.message }, 500);
	}

	// 2. FORMAT RESPONSE (Optional but recommended for consistency)
	// The RPC returns flat columns (e.g., 'other_participant_full_name').
	// We nest this data to match the structure the Flutter app expects.
	const formattedData = data
		? data.map((row: any) => ({
				room_id: row.room_id,
				other_participant: {
					id: row.other_participant_id,
					full_name: row.other_participant_full_name,
					role: row.other_participant_role,
				},
			}))
		: [];

	// 3. Return the clean, nested JSON
	return c.json(formattedData);
});

/**
 * POST /api/chat/initiate
 * UI: Called when a student taps on a teacher's name.
 * Securely finds or creates a 1-on-1 chat room.
 */
app.post("/initiate", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");
	const { recipient_id } = await c.req.json();

	if (!recipient_id) {
		throw new HTTPException(400, { message: "recipient_id is required" });
	}

	// --- Call our new "smart" function ---
	// The RPC handles all security checks *and* room creation in one call.
	const { data, error: rpcError } = await supabase.rpc("initiate_secure_chat", {
		sender_id: user.id,
		recipient_id: recipient_id,
	});

	if (rpcError) {
		// This will return the "You do not have permission" error if check fails
		throw new HTTPException(403, { message: rpcError.message });
	}

	return c.json({ room_id: data });
});

/**
 * GET /api/chat/rooms/:roomId/messages
 * UI: Called when a user opens a specific chat screen.
 * Fetches the message history for one room.
 */
app.get("/rooms/:roomId/messages", async (c) => {
	const supabase = c.get("supabase");
	const roomId = c.req.param("roomId");
	const { limit = 50 } = c.req.query();

	// RLS (from Step 1) automatically ensures the user can only
	// query rooms they are a part of.
	const { data, error } = await supabase
		.from("chat_messages")
		.select(
			`
		id, content, created_at, sender_id,
		sender:users ( full_name, role )
	`,
		)
		.eq("room_id", roomId)
		.order("created_at", { ascending: false })
		.limit(Number(limit));

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	// Return messages in chronological order (oldest first)
	return c.json(data.reverse());
});

/**
 * POST /api/chat/rooms/:roomId/messages
 * UI: Called when the user hits the "Send" button.
 * Inserts a new message into the database.
 */
app.post("/rooms/:roomId/messages", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");
	const roomId = c.req.param("roomId");
	const { content } = await c.req.json();

	if (!content) {
		throw new HTTPException(400, { message: "content is required" });
	}

	// RLS (from Step 1) ensures the user can only insert
	// into rooms they are a part of, and sender_id matches their own.
	const { data, error } = await supabase
		.from("chat_messages")
		.insert({
			room_id: roomId,
			sender_id: user.id,
			content: content,
		})
		.select(
			`
      id, content, created_at, sender_id,
      sender:users ( full_name, role )
    `,
		) // Return full message data with sender info
		.single();

	if (error) {
		return c.json({ error: error.message }, 500);
	}

	// The Realtime broadcast (Step 2) is triggered by this INSERT.
	// The client's WebSocket will receive this event and update the UI.
	return c.json({ success: true, message: data });
});

export default app;
