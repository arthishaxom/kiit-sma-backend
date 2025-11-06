import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "@/middlewares/auth";
import type { Variables } from "@/types/auth";

const app = new Hono<{ Variables: Variables }>();

// Apply auth middleware to ALL routes in this file
app.use("*", authMiddleware);

/**
 * GET /api/users/me
 * Returns the profile of the currently logged-in user.
 */
app.get("/me", async (c) => {
	const user = c.get("user");
	return c.json(user);
});

/**
 * DELETE /api/users/me/reset
 * UI: Test button in Account screen.
 * Deletes all enrollments, fees, and attendance for the user.
 */
app.delete("/me/reset", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

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
	const supabase = c.get("supabase");
	const user = c.get("user");
	const { avatar_url } = await c.req.json();

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
