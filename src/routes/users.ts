import type { SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "@/middlewares/auth";
import type { AuthUser, Variables } from "@/types/auth";

const app = new Hono<{ Variables: Variables }>();

// Apply auth middleware to ALL routes in this file
app.use("*", authMiddleware);

/**
 * GET /api/users/me
 * Returns the profile of the currently logged-in user.
 */
app.get("/me", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;

	// 1. If not a student, return the basic profile.
	if (user.role !== "student") {
		return c.json(user);
	}

	// 2. If student, get extra data...
	let current_semester: number | null = null;
	let enrolled_sections: string | null = null;

	try {
		// 3. Call RPC to get current semester
		const { data: semData, error: semError } = await supabase.rpc(
			"get_current_semester_for_student",
			{ p_roll_no: user.roll_no },
		);
		if (semError) throw semError;
		current_semester = semData as number;

		// 4. Get names of sections for *this* semester
		const { data: sectionData, error: secError } = await supabase
			.from("enrollments")
			// Use !inner join to filter and select in one query
			.select("sections!inner ( section_name )")
			.eq("user_id", user.id)
			.eq("sections.semester", current_semester); // Filter by current semester

		if (secError) throw secError;

		// 5. Format section names into a single string
		if (sectionData && sectionData.length > 0) {
			enrolled_sections = (
				sectionData as unknown as Array<{ sections: { section_name: string } }>
			)
				.map((s) => s.sections.section_name)
				.join(", "); // e.g., "CSE-1, DL-1, EPP-1"
		}

		// 6. Return the "enriched" user object
		return c.json({
			...user,
			current_semester,
			enrolled_sections,
		});
	} catch (error: unknown) {
		// If fetches fail, just return the basic user
		console.error(
			"Error enriching user profile:",
			error instanceof Error ? error.message : "Unknown error",
		);
		return c.json(user);
	}
});

/**
 * DELETE /api/users/me/reset
 * UI: Test button in Account screen.
 * Deletes all enrollments, fees, and attendance for the user.
 */
app.delete("/me/reset", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;

	// Only students can reset their account
	if (user.role !== "student") {
		throw new HTTPException(403, {
			message: "Only students can reset their account",
		});
	}

	const { error } = await supabase.rpc("reset_student_for_testing", {
		user_id: user.id,
	});

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	return c.json({ success: true, message: "Account reset" });
});

/**
 * POST /api/users/me/avatar
 * Updates the user's avatar URL after Flutter uploads to Supabase Storage.
 */
app.post("/me/avatar", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;
	const { avatar_url } = await c.req.json<{ avatar_url: string }>();

	if (!avatar_url) {
		throw new HTTPException(400, { message: "avatar_url is required" });
	}

	const { data, error } = await supabase
		.from("users")
		.update({ avatar_url })
		.eq("id", user.id)
		.select("avatar_url")
		.single();

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	return c.json(data);
});

export default app;
