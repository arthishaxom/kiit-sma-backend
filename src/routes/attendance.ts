import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "@/types/auth";
import { authMiddleware, roleGuard } from "../middlewares/auth";

// Initialize a new Hono router
const app = new Hono<{ Variables: Variables }>();

// Apply authentication middleware to ALL routes in this file
app.use("*", authMiddleware);

// --- Student Dashboard Endpoint ---

/**
 * GET /api/attendance/summary
 * UI: Populates the "Attendance" card on the Home dashboard.
 * Returns a student's attendance percentage for all enrolled courses.
 * This endpoint calls the `get_student_attendance_summary` SQL function.
 */
app.get("/summary", roleGuard(["student"]), async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// Call the database function to do all the complex calculations
	const { data, error } = await supabase.rpc("get_student_attendance_summary", {
		student_id_input: user.id,
	});

	if (error) {
		return c.json({ error: error.message }, 500);
	}

	// If the student has no courses, the function returns null.
	// We'll return an empty array for a clean client-side experience.
	return c.json(data || []);
});

// --- Teacher QR Generation Endpoint ---

/**
 * POST /api/attendance/session
 * UI: Called by a Teacher when they tap "Start Session" for a class.
 * Receives the class info and teacher's location.
 * Generates a short-lived token and returns it to the teacher's app.
 */
app.post("/session", roleGuard(["teacher"]), async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// 1. Get the payload from the teacher's app
	const { course_id, section_id, latitude, longitude } = await c.req.json();

	// 2. Validate input
	if (
		!course_id ||
		!section_id ||
		latitude === undefined ||
		longitude === undefined
	) {
		throw new HTTPException(500, {
			message: "Missing course_id, section_id, or location data",
		});
	}

	// 3. Call our new "smart" SQL function
	// This function handles all logic for creating OR refreshing a session.
	const { data, error } = await supabase.rpc("create_or_refresh_session", {
		course_id_input: course_id,
		section_id_input: section_id,
		teacher_id_input: user.id, // Pass the teacher's ID
		teacher_latitude: latitude,
		teacher_longitude: longitude,
	});

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	// 4. Extract the token from the function's response
	// The RPC returns a table like: [{ session_token: '123456' }]
	const token = data?.[0]?.session_token;

	if (!token) {
		return c.json({ error: "Failed to create or refresh session" }, 500);
	}

	// 5. Return the new token. The teacher's app will render this as a QR code.
	return c.json({ token });
});

// --- Student QR Scan Endpoint ---

/**
 * POST /api/attendance/scan
 * UI: Called by a Student when they scan a QR code.
 * Submits the token (from the QR) and their current location.
 * This endpoint calls the `validate_attendance_scan` SQL function.
 */
app.post("/scan", roleGuard(["student"]), async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// 1. Get the payload from the student's app
	const { token, latitude, longitude } = await c.req.json();

	// 2. Validate input
	if (!token || latitude === undefined || longitude === undefined) {
		throw new HTTPException(400, {
			message: "Missing token or location data",
		});
	}

	// 3. Call the secure database function to validate everything
	// This RPC handles all logic: token, expiry, location, double-scan
	const { data, error } = await supabase.rpc("validate_attendance_scan", {
		student_id_input: user.id,
		token_input: token,
		student_latitude: latitude,
		student_longitude: longitude,
	});

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	// 4. The 'data' variable contains the *status message* from the function
	if (data !== "Success") {
		// Return a user-friendly error message
		// e.g., 'Token expired', 'You are too far from the classroom', 'Already marked'
		throw new HTTPException(400, { message: data });
	}

	// 5. If we get here, it was successful
	return c.json({ success: true, message: "Attendance marked successfully" });
});

// Export the router
export default app;
