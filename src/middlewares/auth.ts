/** biome-ignore-all lint/style/noNonNullAssertion: ENV */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Context, Next } from "hono";
import "dotenv/config";

const authVerificationClient = createClient(
	process.env.SUPABASE_URL!,
	process.env.SUPABASE_ANON_KEY!,
);

export const authMiddleware = async (c: Context, next: Next) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}
	const token = authHeader.split(" ")[1];

	const {
		data: { user },
		error: authError,
	} = await authVerificationClient.auth.getUser(token);

	if (authError || !user) {
		return c.json({ error: "Invalid token" }, 401);
	}

	const serviceSupabase: SupabaseClient = c.get("supabase");
	const { data: profile, error: profileError } = await serviceSupabase
		.from("users")
		.select("id, role, email, full_name, roll_no")
		.eq("id", user.id)
		.single();

	if (profileError || !profile) {
		return c.json({ error: "User profile not found" }, 404);
	}

	c.set("user", profile);
	await next();
};

// Role guard middleware (no client usage)
export const roleGuard = (roles: Array<string>) => {
	return async (c: Context, next: Next) => {
		const user = c.get("user");
		if (!user || !roles.includes(user.role)) {
			return c.json({ error: "Forbidden: Insufficient privileges" }, 403);
		}
		await next();
	};
};
