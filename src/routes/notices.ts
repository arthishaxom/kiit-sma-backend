import type { User as AuthUser, SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "@/middlewares/auth";
import type { Variables } from "@/types/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware);

/**
 * GET /api/v1/notices
 * UI: Populates the "Notices & Events" feed.
 * RLS automatically filters this query for students, teachers, and admins.
 */
app.get("/", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");

	const { data, error } = await supabase
		.from("notices")
		.select("*") // RLS policies will filter this
		.order("created_at", { ascending: false });

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	return c.json(data);
});

/**
 * POST /api/v1/notices
 * UI: Teacher/Admin "Create Notice" screen.
 */
app.post("/", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;
	const body = await c.req.json();

	// Validation
	if (!body.title || !body.type || !body.scope) {
		throw new HTTPException(400, { message: "Missing required fields" });
	}

	// Teacher security check
	if (user.role === "teacher") {
		if (body.scope !== "section" || !body.section_id) {
			throw new HTTPException(403, {
				message: "Teachers can only post to a specific section",
			});
		}

		// Verify teacher teaches this section
		const { data: sectionData } = await supabase
			.from("timetables")
			.select("section_id")
			.eq("teacher_id", user.id)
			.eq("section_id", body.section_id)
			.limit(1);

		if (!sectionData || sectionData.length === 0) {
			throw new HTTPException(403, {
				message: "You do not teach this section",
			});
		}
	}

	// Admin security check
	if (user.role === "admin" && body.scope === "section") {
		throw new HTTPException(403, {
			message: "Admins can only post global notices",
		});
	}

	// Insert
	const { data, error } = await supabase
		.from("notices")
		.insert({
			user_id: user.id,
			title: body.title,
			description: body.description,
			type: body.type,
			scope: body.scope,
			section_id: body.scope === "section" ? body.section_id : null,
			registration_link: body.type === "event" ? body.registration_link : null,
		})
		.select()
		.single();

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	return c.json(data);
});

export default app;
