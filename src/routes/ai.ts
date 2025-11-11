import { google } from "@ai-sdk/google";
import { type CoreMessage, generateText, stepCountIs, tool } from "ai";
import { Hono } from "hono";
import "dotenv/config";
import { tavily } from "@tavily/core";
import { HTTPException } from "hono/http-exception";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { authMiddleware } from "@/middlewares/auth";
import type { Variables } from "@/types/auth";

export const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });

export const webSearch = tool({
	description: "Search the web for up-to-date information",
	inputSchema: z.object({
		query: z.string().min(1).max(100).describe("The search query"),
	}),
	execute: async ({ query }) => {
		const response = await tavilyClient.search(query);
		return response.results.map((result) => ({
			title: result.title,
			url: result.url,
			content: result.content,
			score: result.score,
		}));
	},
});

const app = new Hono<{ Variables: Variables }>();
app.use("*", authMiddleware);

/**
 * POST /api/ai/chat
 * Main chatbot with tools for student data + Google Search
 * Now supports file attachments (images, PDFs, etc.)
 */
app.post("/chat", async (c) => {
	// Parse the request body - could be JSON or multipart form data
	const contentType = c.req.header("content-type") || "";
	let messages: CoreMessage[];
	const attachedFiles: File[] = [];

	if (contentType.includes("multipart/form-data")) {
		// Handle multipart form data with file attachments
		const body = await c.req.parseBody();
		const messagesJson = body.messages;

		if (typeof messagesJson !== "string") {
			throw new HTTPException(400, {
				message: "messages field is required in multipart request",
			});
		}

		messages = JSON.parse(messagesJson);

		// Collect all file attachments
		for (const [key, value] of Object.entries(body)) {
			if (key.startsWith("file_") && value instanceof File) {
				attachedFiles.push(value);
			}
		}
	} else {
		// Handle regular JSON request
		const jsonBody = await c.req.json();
		messages = jsonBody.messages;
	}

	const supabase = c.get("supabase");
	const user = c.get("user");

	// Process file attachments and add them to the last user message
	if (attachedFiles.length > 0 && messages.length > 0) {
		const lastMessage = messages[messages.length - 1];
		if (lastMessage.role === "user") {
			// Convert content to array format if it's a string
			let textContent = "";
			if (typeof lastMessage.content === "string") {
				textContent = lastMessage.content;
			} else if (Array.isArray(lastMessage.content)) {
				const textPart = lastMessage.content.find(
					(part) => part.type === "text",
				);
				textContent = textPart?.type === "text" ? textPart.text : "";
			}

			const contentParts: Array<
				| { type: "text"; text: string }
				| { type: "image"; image: Uint8Array }
				| {
						type: "file";
						data: Uint8Array;
						mediaType: string;
						filename?: string;
				  }
			> = [{ type: "text", text: textContent }];

			// Add file attachments
			for (const file of attachedFiles) {
				const fileBuffer = await file.arrayBuffer();
				const uint8Array = new Uint8Array(fileBuffer);

				// Determine if it's an image or other file type
				if (file.type.startsWith("image/")) {
					contentParts.push({
						type: "image",
						image: uint8Array,
					});
				} else {
					// For PDFs and other files
					contentParts.push({
						type: "file",
						data: uint8Array,
						mediaType: file.type,
						filename: file.name,
					});
				}
			}

			lastMessage.content = contentParts;
		}
	}

	const result = await generateText({
		model: google("gemini-2.5-flash"),
		system: `
You are KIIT University’s official student assistant.
You have access to several tools for accurate, real-time answers.

Use tools **whenever relevant**, and your own reasoning otherwise.

**When to use tools:**
- For student-specific data:
  - Use getAttendanceSummary → for attendance details.
  - Use getFeeSummary → for fee payment, due, or status.
  - Use getGrades → for GPA, marks, or academic performance.
  - Use getSchedule → for class schedule, timings, room numbers, and course information.
- For general factual or event-related queries (like holidays, notices, or KIIT info):
  - Use google_search to look up the latest, verified information.

**When not to use tools:**
- For simple conceptual or conversational questions (e.g. “How can I study better?”),
  answer directly without calling tools.

**Response style:**
- Be concise, clear, and conversational.
- Always summarize data retrieved from tools in a natural, student-friendly tone.
- Never show raw data or JSON.
- If a tool fails or returns no data, respond gracefully (e.g. "I couldn't find that right now.").
- For schedule queries, format the information in an easy-to-read way with day, time, course, and location.
`,
		messages,
		stopWhen: stepCountIs(5),
		tools: {
			webSearch,
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
			getSchedule: {
				description:
					"Get the student's full weekly class schedule including course names, instructors, timings, days, and room locations. Use this for queries about classes, timetables, what's next, when a specific course is, or where a class is held.",
				inputSchema: z.object({}),
				execute: async () => {
					// Get the student's section IDs first (same logic as schedule.ts)
					const { data: enrollments, error: enrollmentError } = await supabase
						.from("enrollments")
						.select("section_id")
						.eq("user_id", user.id);

					if (enrollmentError) {
						throw new HTTPException(500, { message: enrollmentError.message });
					}

					if (!enrollments || enrollments.length === 0) {
						return []; // Student not enrolled in any sections
					}

					const sectionIds = enrollments.map((e) => e.section_id);

					// Query timetables using the section IDs
					const { data, error } = await supabase
						.from("timetables")
						.select(
							`
							id,
							day,
							room_number,
							start_time,
							end_time,
							courses (
								course_code,
								course_name,
								course_id:id
							),
							sections (
								section_name,
								branch,
								year,
								id
							),
							teacher:users!timetables_teacher_id_fkey (
								id,
								full_name,
								email,
								role
							)
						`,
						)
						.in("section_id", sectionIds)
						.order("day")
						.order("start_time");

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

		// Check if it's a PDF by MIME type or file extension
		const isPdf =
			file.type === "application/pdf" ||
			file.name?.toLowerCase().endsWith(".pdf");

		if (!isPdf) {
			throw new HTTPException(400, {
				message:
					"File must be a PDF. Received type: " +
					(file.type || "unknown") +
					", name: " +
					(file.name || "unknown"),
			});
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
