import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "@/types/auth";
import { authMiddleware, roleGuard } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();

// Apply auth middleware to ALL routes in this file
app.use("*", authMiddleware);

/**
 * GET /api/sections
 * Fetches all available sections a student can join.
 */
app.get("/", roleGuard(["student"]), async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	const { data, error } = await supabase
		.rpc("get_available_sections_for_student", { p_user_id: user.id })
		.select();

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	return c.json(data);
});

/**
 * POST /api/sections/:sectionId/enroll
 * Allows a student to enroll themselves in a section.
 */
app.post("/:sectionId/enroll", roleGuard(["student"]), async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");
	const sectionId = c.req.param("sectionId");

	const { data, error } = await supabase.rpc("enroll_in_section", {
		section_id_to_enroll: sectionId,
		user_id_to_enroll: user.id,
	});

	if (error) {
		throw new HTTPException(400, { message: error.message });
	}
	if (data !== "Enrolled successfully") {
		throw new HTTPException(401, { message: data });
	}

	return c.json({ success: true, message: "Enrolled successfully" });
});

/**
 * GET /api/enrollments/my
 * UI: The Flutter app calls this ONCE after login.
 * * It checks if a student is enrolled in any sections.
 * - If it returns [], the app navigates to the "Section Selection" screen.
 * - If it returns data, the app navigates to the "Home" dashboard.
 * * It also returns section info, which the app can cache and use
 * on the Profile screen.
 */
app.get("/my", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// Find all enrollments for the current user
	const { data, error } = await supabase
		.from("enrollments")
		.select(`
		section_id,
		sections ( section_name, branch, year )
	`) // Also get the details of the sections they are in
		.eq("user_id", user.id);

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	// This will return [] if not enrolled, which is exactly
	// what the Flutter app needs to check.
	return c.json(data);
});

app.get("/my-courses", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// Call the RPC function we just created
	const { data, error } = await supabase.rpc("get_student_courses", {
		student_id_input: user.id,
	});

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	return c.json(data);
});

export default app;
