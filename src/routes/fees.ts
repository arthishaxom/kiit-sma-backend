import type { SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import type { Variables } from "@/types/auth";
import { authMiddleware, roleGuard } from "../middlewares/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware, roleGuard(["student"])); // All routes are student-only

/**
 * GET /api/fees
 * UI: Populates the dedicated "Fees" tab.
 * Returns a student's complete fee history (all 8 semesters)
 * with a detailed breakdown and payment history.
 */
app.get("/", async (c) => {
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user");

	const { data, error } = await supabase
		.from("fees")
		.select(`
      id, semester, total_amount, due_date, status, fee_breakdown,
      payment_history ( id, amount, transaction_id, payment_date )
    `)
		.eq("user_id", user.id)
		.order("semester", { ascending: true });

	if (error) {
		return c.json({ error: error.message }, 500);
	}
	return c.json(data);
});

/**
 * GET /api/fees/summary
 * UI: Populates the "Fees" card on the Home dashboard.
 * Returns a fast, simple summary of the student's fee status,
 * including total due, total paid, and next due date.
 */
app.get("/summary", async (c) => {
	const supabase = c.get("supabase");
	const user = c.get("user");

	// Get all fees that are not fully paid
	const { data, error } = await supabase
		.from("fees")
		.select("total_amount, due_date, status, payment_history(amount)")
		.eq("user_id", user.id)
		.in("status", ["overdue", "partial", "due"]) // Include 'due' for newly created fees
		.order("due_date", { ascending: true });

	if (error) {
		return c.json({ error: error.message }, 500);
	}

	// If there are no due fees, all summary values are 0 or null.
	if (!data || data.length === 0) {
		return c.json({ total_due: 0, total_paid: 0, next_due_date: null });
	}

	let total_due = 0;
	let total_paid_for_due_fees = 0; // Total paid *for these specific fees*
	const next_due_date = data[0].due_date; // The soonest due date

	data.forEach((fee) => {
		// Calculate total paid *for this one fee*
		const total_paid_for_this_fee = fee.payment_history.reduce(
			(acc: number, payment: { amount: number }) => acc + payment.amount,
			0,
		);

		// Calculate the pending amount *for this one fee*
		total_due += fee.total_amount - total_paid_for_this_fee;

		// Add this fee's paid amount to the grand total_paid
		total_paid_for_due_fees += total_paid_for_this_fee;
	});

	// Return all three values
	return c.json({
		total_due,
		total_paid: total_paid_for_due_fees,
		next_due_date,
	});
});

export default app;
