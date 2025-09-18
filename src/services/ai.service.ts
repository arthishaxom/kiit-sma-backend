import { google } from "@ai-sdk/google";
import { generateText, type ModelMessage, stepCountIs, tool } from "ai";
import { z } from "zod";
import { db } from "../config/firebase.config";
import { ApiError } from "../utils/apiError.util";

function isAttendanceQuery(messages: ModelMessage[]): boolean {
	const attendanceKeywords = [
		"attendance",
		"present",
		"absent",
		"classes attended",
		"attendance percentage",
		"missed classes",
	];
	const lastUserMessage = messages.filter((msg) => msg.role === "user").pop();

	if (!lastUserMessage?.content) return false;

	const content =
		typeof lastUserMessage.content === "string"
			? lastUserMessage.content.toLowerCase()
			: lastUserMessage.content
					.map((part) =>
						typeof part === "string" ? part : "text" in part ? part.text : "",
					)
					.join(" ")
					.toLowerCase();

	return attendanceKeywords.some((keyword) => content.includes(keyword));
}

async function getSections(userId: string) {
	const sectionsDoc = await db.collection("users").doc(userId).get();
	return sectionsDoc.data()?.sections;
}

async function getAttendanceData(
	userId: string,
	courseId: string,
	sectionId: string,
) {
	try {
		const courseSectionDoc = await db
			.collection("course_sections")
			.doc(`${courseId}_${sectionId}`)
			.get();

		const studentDoc = await db
			.collection("attendance_summary")
			.doc(userId)
			.get();

		if (!studentDoc.exists) {
			throw new Error("Student attendance data not found");
		}

		const courseDoc = await db
			.collection("attendance_summary")
			.doc(userId)
			.collection("courses")
			.doc(`${courseId}`)
			.get();

		let totalSessions = 0;
		let attendedSessions = 0;

		attendedSessions = courseDoc.data()?.sessionsAttended || 0;
		totalSessions = courseSectionDoc.data()?.totalSessions || 0;

		const attendancePercentage =
			totalSessions > 0 ? (attendedSessions / totalSessions) * 100 : 0;

		return {
			attendance: Math.round(attendancePercentage),
			totalClasses: totalSessions,
			attendedClasses: attendedSessions,
			status: attendancePercentage >= 75 ? "Good" : "Below Required",
		};
	} catch (error) {
		throw new Error("Failed to fetch attendance data");
	}
}

async function getFeesData(userId: string, includeHistory = false) {
	try {
		const feesDoc = await db.collection("fees").doc(userId).get();

		if (!feesDoc.exists) {
			return { error: "Student fees data not found" };
		}

		const feesData = feesDoc.data();

		const semestersSnapshot = await db
			.collection("fees")
			.doc(userId)
			.collection("semesters")
			.get();

		let totalFees = 0;
		let paidAmount = 0;
		let outstandingFees = 0;
		const paymentHistory: any[] = [];

		semestersSnapshot.forEach((doc) => {
			const semesterData = doc.data();
			totalFees += semesterData.totalAmount || 0;
			paidAmount += semesterData.amountPaid || 0;
			outstandingFees += semesterData.dueAmount || 0;

			if (includeHistory && semesterData.paymentHistory) {
				paymentHistory.push(...semesterData.paymentHistory);
			}
		});

		const result: any = {
			totalFees,
			paidAmount,
			outstandingFees: feesData?.overallDueAmount || outstandingFees,
			feesPaid: outstandingFees === 0,
			status: outstandingFees > 0 ? "Pending" : "Cleared",
		};

		if (includeHistory) {
			result.paymentHistory = paymentHistory;
		}

		return result;
	} catch (error) {
		return { error: "Failed to fetch fees data" };
	}
}

async function getGradesData(userId: string, semester?: string) {
	try {
		const gradesDoc = await db.collection("grades").doc(userId).get();

		if (!gradesDoc.exists) {
			return { error: "Student grades data not found" };
		}

		const data = gradesDoc.data();
		let grades = data?.grades || {};

		if (semester) {
			grades = grades[semester] || {};
		}

		return {
			grades,
			gpa: data?.gpa || 0,
			currentSemester: data?.currentSemester,
			totalCredits: data?.totalCredits || 0,
		};
	} catch (error) {
		return { error: "Failed to fetch grades data" };
	}
}

async function getScheduleData(userId: string, date?: string) {
	try {
		const scheduleDoc = await db.collection("schedules").doc(userId).get();

		if (!scheduleDoc.exists) {
			return { error: "Student schedule data not found" };
		}

		const data = scheduleDoc.data();

		if (date) {
			const daySchedule = data?.schedule?.[date] || [];
			return { schedule: daySchedule, date };
		}

		return {
			weeklySchedule: data?.schedule || {},
			currentSemester: data?.currentSemester,
			courses: data?.courses || [],
		};
	} catch (error) {
		return { error: "Failed to fetch schedule data" };
	}
}

// Now define the AIService with proper tool references
export const AIService = {
	// Export the individual functions for direct use
	getAttendanceData,
	getFeesData,
	getGradesData,
	getScheduleData,

	async generateChatResponse(message: string, userId: string) {
		try {
			const result = await generateText({
				model: google("gemini-2.5-flash-lite"),
				system: `You are a helpful student assistant for KIIT SMA (Student Management App). Use the available tools to fetch real-time student information when needed. 
            
            Always provide accurate, helpful responses based on the data you retrieve. If a student asks about multiple topics, 
            feel free to use multiple tools to give comprehensive answers.
            
            Be conversational and supportive in your responses. Address the student in a friendly manner.`,
				prompt: message,
				tools: {
					getSections: tool({
						description: "Get student sections",
						inputSchema: z.object({}),
						execute: async () => {
							return await getSections(userId);
						},
					}),
					getAttendance: tool({
						description:
							"Get student attendance information including percentage, total classes, attended classes, and attendance status",
						inputSchema: z.object({
							courseId: z.string().describe("Course ID"),
							sectionId: z.string().describe("Section ID"),
						}),
						execute: async ({
							courseId,
							sectionId,
						}: {
							courseId: string;
							sectionId: string;
						}) => {
							return await getAttendanceData(userId, courseId, sectionId);
						},
					}),

					getFees: tool({
						description:
							"Get student fee information including total fees, paid amount, outstanding fees, and payment status",
						inputSchema: z.object({
							includeHistory: z
								.boolean()
								.optional()
								.describe("Whether to include payment history"),
						}),
						execute: async ({
							includeHistory = false,
						}: {
							includeHistory?: boolean;
						}) => {
							return await getFeesData(userId, includeHistory);
						},
					}),

					getGrades: tool({
						description:
							"Get student grades, GPA, and academic performance information",
						inputSchema: z.object({
							semester: z
								.string()
								.optional()
								.describe("Specific semester to get grades for"),
						}),
						execute: async ({ semester }: { semester?: string }) => {
							return await getGradesData(userId, semester);
						},
					}),

					getSchedule: tool({
						description: "Get student class schedule and course information",
						inputSchema: z.object({
							date: z
								.string()
								.optional()
								.describe(
									"Specific date in YYYY-MM-DD format for daily schedule",
								),
						}),
						execute: async ({ date }: { date?: string }) => {
							return await getScheduleData(userId, date);
						},
					}),
				},
				stopWhen: stepCountIs(5),
				prepareStep: async ({ stepNumber, messages }) => {
					// Only on the first step and if it's an attendance query
					if (stepNumber === 0 && isAttendanceQuery(messages)) {
						return {
							// Force the AI to call getSections first
							toolChoice: { type: "tool", toolName: "getSections" },
							// Limit available tools to just getSections for this step
							activeTools: ["getSections"],
						};
					}

					// For subsequent steps or non-attendance queries, use default settings
					return undefined;
				},
			});

			return {
				message: result.text,
				success: true,
				toolCallsUsed: result.toolCalls?.length || 0,
			};
		} catch (error) {
			throw new ApiError(500, "Failed to generate AI response" + error);
		}
	},
};
