/** biome-ignore-all lint/style/noNonNullAssertion: ENV */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import "dotenv/config"; // Load .env

import aiRoutes from "./routes/ai";
import attendanceRoutes from "./routes/attendance";
import chatRoutes from "./routes/chat";
import feesRoutes from "./routes/fees";
import gradesRoutes from "./routes/grades";
import noticesRoutes from "./routes/notices";
import scheduleRoutes from "./routes/schedule";
import sectionRoutes from "./routes/sections";
import teacherRoutes from "./routes/teacher";
import userRoutes from "./routes/users";
import type { Variables } from "./types/auth";

const app = new Hono<{ Variables: Variables }>().basePath("/api/v1");

app.onError((err, c) => {
	console.log(`${err}`); // Log the error for debugging

	if (err instanceof HTTPException) {
		console.error(err.cause);
		// Get the custom response
		return err.getResponse();
	}
	// Determine the status code and message
	const message = err.message || "Internal Server Error";

	// Return a custom error response
	return c.json({ error: message }, 500);
});

const supabase: SupabaseClient = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// CORS must be configured BEFORE other middleware
app.use(
	"*",
	cors({
		origin: ["https://kiitsap.netlify.app"], // In production, replace with your actual domain
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"Accept",
			"Origin",
			"X-Requested-With",
		],
		allowMethods: ["POST", "GET", "PUT", "DELETE", "OPTIONS", "PATCH"],
		exposeHeaders: ["Content-Length", "X-Request-Id"],
		maxAge: 600,
		credentials: true,
	}),
);

app.use("*", (c, next) => {
	c.set("supabase", supabase);
	return next();
});

app.route("/users", userRoutes);
app.route("/sections", sectionRoutes);
app.route("/fees", feesRoutes);
app.route("/grades", gradesRoutes);
app.route("/notices", noticesRoutes);
app.route("/schedule", scheduleRoutes);
app.route("/attendance", attendanceRoutes);
app.route("/chat", chatRoutes);
app.route("/ai", aiRoutes);
app.route("/teacher", teacherRoutes);

app.get("/healthcheck", (c) => {
	return c.text("KIIT SAP Backend API is running!");
});

const port = process.env.PORT || 3000;
console.log(`Server is running on port ${port}`);

export default {
	port,
	fetch: app.fetch,
};
