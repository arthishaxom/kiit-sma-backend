import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Variables } from "@/types/auth";
import { authMiddleware } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware);

/**
 * GET /api/schedule/today
 * UI: Populates the "Today's Schedule" card on the Home dashboard.
 *
 * This is a "smart" endpoint:
 * - If you are a STUDENT, it gets your schedule based on all your enrolled sections.
 * - If you are a TEACHER, it gets all classes you are teaching today.
 */
app.get("/today", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// --- Get current day in India (IST) ---
	// This is critical so that at 2:00 AM, it correctly shows "Saturday"
	// instead of "Friday" (which it would be in UTC).
	const now = new Date();
	const todayIST = new Date(
		now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
	);
	const dayNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	const todayDayName = dayNames[todayIST.getDay()];
	// ----------------------------------------

	let query = supabase.from("timetables").select(`
	id, room_number, start_time, end_time,
	courses ( course_name, course_code, course_id:id ),
	sections ( section_name, branch, year, id ),
	teacher:users!timetables_teacher_id_fkey ( id, full_name, role )
	`);

	// --- Build query based on user role ---
	if (user.role === "student") {
		// --- THIS IS THE FIX ---
		// 1. Get the student's section IDs first
		const { data: enrollments, error: enrollmentError } = await supabase
			.from("enrollments")
			.select("section_id")
			.eq("user_id", user.id);

		if (enrollmentError) {
			throw new HTTPException(500, { message: enrollmentError.message });
		}

		// Create an array of strings: ['sec-uuid-1', 'sec-uuid-2']
		const sectionIds = enrollments.map((e) => e.section_id);

		if (sectionIds.length === 0) {
			// Student is not enrolled in any sections
			return c.json([]);
		}

		// 2. Use the array of IDs in the main query
		query = query
			.in("section_id", sectionIds) // <-- Now this is a valid array
			.eq("day", todayDayName);
	} else if (user.role === "teacher") {
		// For a teacher, find all classes they are assigned to.
		query = query.eq("teacher_id", user.id).eq("day", todayDayName);
	} else {
		// Admin or other roles have no schedule
		return c.json([]);
	}
	// ------------------------------------

	const { data, error } = await query.order("start_time");

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	// Return the list of classes for the day
	return c.json(data);
});

/**
 * GET /api/schedule/full
 * UI: Populates the dedicated "Full Schedule" tab.
 * Returns the user's complete timetable for all days.
 */
app.get("/full", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	let query = supabase.from("timetables").select(`
	id, day, room_number, start_time, end_time,
	courses ( course_name, course_code, course_id:id ),
	sections ( section_name, branch, year, id ),
	teacher:users!timetables_teacher_id_fkey ( id, full_name, role )
	`);

	if (user.role === "student") {
		// Get all section IDs for the student
		const { data: enrollments, error: enrollError } = await supabase
			.from("enrollments")
			.select("section_id")
			.eq("user_id", user.id);

		if (enrollError) {
			throw new HTTPException(500, { message: enrollError.message });
		}
		if (!enrollments || enrollments.length === 0) return c.json([]);

		const sectionIds = enrollments.map((e) => e.section_id);
		query = query.in("section_id", sectionIds);
	} else if (user.role === "teacher") {
		query = query.eq("teacher_id", user.id);
	} else {
		return c.json([]);
	}

	// Order by day, then by time
	const { data, error } = await query.order("day").order("start_time");

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}
	return c.json(data);
});

app.get("/", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	let query = supabase.from("timetables").select(`
	id, room_number, start_time, end_time,
	courses ( course_name, course_code ),
	sections ( section_name, branch, year )
	`);

	// --- Build query based on user role ---
	if (user.role === "student") {
		// --- THIS IS THE FIX ---
		// 1. Get the student's section IDs first
		const { data: enrollments, error: enrollmentError } = await supabase
			.from("enrollments")
			.select("section_id")
			.eq("user_id", user.id);

		if (enrollmentError) {
			throw new HTTPException(500, { message: enrollmentError.message });
		}

		// Create an array of strings: ['sec-uuid-1', 'sec-uuid-2']
		const sectionIds = enrollments.map((e) => e.section_id);

		if (sectionIds.length === 0) {
			// Student is not enrolled in any sections
			return c.json([]);
		}

		console.log(sectionIds);
		// 2. Use the array of IDs in the main query
		query = query.in("section_id", sectionIds); // <-- Now this is a valid array
	} else if (user.role === "teacher") {
		// For a teacher, find all classes they are assigned to.
		query = query.eq("teacher_id", user.id);
	} else {
		// Admin or other roles have no schedule
		return c.json([]);
	}
	// ------------------------------------

	const { data, error } = await query.order("start_time");

	if (error) {
		throw new HTTPException(500, { message: error.message });
	}

	// Return the list of classes for the day
	return c.json(data);
});

export default app;
