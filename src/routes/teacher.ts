import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { authMiddleware, roleGuard } from "../middlewares/auth";
import type { Variables } from "../types/auth";

const app = new Hono<{ Variables: Variables }>();
// This entire route file is for teachers only
app.use("*", authMiddleware, roleGuard(["teacher"]));

/**
 * GET /api/teacher/my-sections
 * UI: Populates "Select Section" dropdown in CreateNoticeScreen.
 */
app.get("/my-sections", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;

	const { data, error } = await supabase.rpc("get_teacher_sections", {
		teacher_id_input: user.id,
	});

	if (error) {
		return c.json({ error: error.message }, 500);
	}

	// Returns: [{ section_id, section_name, course_name }, ...]
	return c.json(data);
});

export default app;
