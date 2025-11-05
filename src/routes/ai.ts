import { google } from "@ai-sdk/google";
import { type CoreMessage, generateText, stepCountIs } from "ai";
import { Hono } from "hono";
import "dotenv/config";
import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";
import { HTTPException } from "hono/http-exception";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { authMiddleware } from "@/middlewares/auth";
import type { Variables } from "@/types/auth";

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware);

/**
 * POST /api/ai/chat
 * Main chatbot with tools for student data + Google Search
 */
app.post("/chat", async (c) => {
	const { messages }: { messages: CoreMessage[] } = await c.req.json();
	const supabase: SupabaseClient = c.get("supabase");
	const user = c.get("user") as AuthUser;

	const result = await generateText({
		model: google("gemini-2.5-flash"),
		system:
			"You are a helpful KIIT University student assistant. " +
			"Use the available tools to fetch real-time student information when needed. " +
			"Always provide accurate, helpful responses based on the data you retrieve. " +
			"Be conversational and supportive.",
		messages,
		stopWhen: stepCountIs(5),
		tools: {
			getAttendanceSummary: {
				description:
					"Get the student's current attendance summary including percentage, total classes, and attended classes.",
				inputSchema: z.object({}),
				execute: async () => {
					const { data, error } = await supabase.rpc(
						"get_student_attendance_summary",
						{
							student_id_input: user.id,
						},
					);
					if (error) throw new HTTPException(500, { message: error.message });
					return data;
				},
			},
			getFeeSummary: {
				description:
					"Get the student's fee summary including total fees, amount paid, and outstanding amount.",
				inputSchema: z.object({}),
				execute: async () => {
					const { data, error } = await supabase
						.from("fees")
						.select("total_amount, due_date, status, payment_history(amount)")
						.eq("user_id", user.id)
						.in("status", ["overdue", "partial", "due"]);

					if (error) throw new HTTPException(500, { message: error.message });
					let total_due = 0;
					let total_paid = 0;
					const fees = data as {
						total_amount: number;
						payment_history: { amount: number }[];
					}[];
					fees?.forEach((fee) => {
						const paid_for_fee = fee.payment_history.reduce(
							(a, p) => a + (p.amount || 0),
							0,
						);
						total_due += (fee.total_amount || 0) - paid_for_fee;
						total_paid += paid_for_fee;
					});
					return { total_due, total_paid };
				},
			},
			getGrades: {
				description:
					"Get the student's academic grades, GPA, and performance information.",
				inputSchema: z.object({}),
				execute: async () => {
					const { data, error } = await supabase
						.from("student_grades")
						.select("semester, sgpa, letter_grade, courses(course_name)")
						.eq("user_id", user.id)
						.order("semester");
					if (error) throw new HTTPException(500, { message: error.message });
					return data;
				},
			},
		},
	});

	return c.json({ response: result.text });
});

/**
 * POST /api/ai/review-resume
 * Resume reviewer - Accepts PDF file
 */
app.post("/review-resume", async (c) => {
	let resume_text: string;

	try {
		// Get the multipart form data
		const body = await c.req.parseBody();
		const file = body.resume_file;

		if (!(file instanceof File)) {
			throw new HTTPException(400, { message: "No file provided." });
		}
		if (file.type !== "application/octet-stream") {
			throw new HTTPException(400, { message: "File must be a PDF." });
		}

		// Extract text from the PDF using pdf-parse v2 API
		const fileBuffer = await file.arrayBuffer();
		const uint8Array = new Uint8Array(fileBuffer);

		try {
			// Initialize parser with buffer data
			const parser = new PDFParse({ data: uint8Array });
			const pdfData = await parser.getText();
			await parser.destroy();

			resume_text = pdfData.text;
		} catch (pdfError) {
			console.error("PDF parsing error:", pdfError);
			throw new HTTPException(500, {
				message:
					"Failed to parse PDF. The file may be corrupted or in an unsupported format.",
			});
		}

		if (!resume_text || resume_text.trim().length === 0) {
			throw new HTTPException(400, {
				message:
					"Could not extract text from PDF. The document may be image-based or empty.",
			});
		}
	} catch (e: unknown) {
		if (e instanceof HTTPException) {
			throw e;
		}
		const error = e as Error;
		throw new HTTPException(500, {
			message: `File processing failed: ${error.message}`,
		});
	}

	// Send the extracted text to Gemini
	const systemPrompt = `You are a top-tier career coach for engineering students.
Review this resume. Provide:
1. A 1-sentence summary.
2. Three actionable, specific strengths.
3. Three actionable, specific weaknesses.
Format as simple Markdown.`;

	const { text } = await generateText({
		model: google("models/gemini-2.0-flash-exp"),
		system: systemPrompt,
		prompt: resume_text,
	});

	return c.json({ response: text });
});

export default app;
