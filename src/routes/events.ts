import { Hono } from "hono";
import type { Variables } from "@/types/auth";
import { authMiddleware } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware); // All users can see events

/**
 * GET /api/events
 * UI: Populates the "Campus Events" card on the Home dashboard.
 * Returns a list of upcoming events.
 */
app.get("/", async (c) => {
	const supabase = c.get("supabase");

	// Get today's date in YYYY-MM-DD format
	const today = new Date().toISOString().split("T")[0];

	const { data, error } = await supabase
		.from("events")
		.select("title, description, start_time, end_time, location")
		// Show events that are happening today or in the future
		.gte("start_time", today)
		.order("start_time", { ascending: true })
		.limit(10); // Limit to the next 10 events

	if (error) {
		return c.json({ error: error.message }, 500);
	}
	return c.json(data);
});

export default app;
