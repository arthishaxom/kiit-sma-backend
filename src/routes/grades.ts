import type { SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { Variables } from "@/types/auth";
import { authMiddleware, roleGuard } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware, roleGuard(["student"]));

/**
 * GET /api/grades
 * UI: Populates the "Grades" tab
 * Returns all grades for the authenticated student
 */
app.get("/", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user");

	const { data, error } = await supabase
		.from("student_grades")
		.select(
			`
      semester,
      sgpa,
      letter_grade,
      courses ( course_name, course_code )
    `,
		)
		.eq("user_id", user.id)
		.order("semester", { ascending: false });

	if (error) {
		return c.json({ error: error.message }, 500);
	}
	return c.json(data);
});

export default app;
