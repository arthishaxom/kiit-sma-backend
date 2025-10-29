import { Hono } from "hono";
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

export default app;
