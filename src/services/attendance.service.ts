import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase.config";
import type {
  CloseSessionData,
  GenerateQRData,
  SubmitScanData,
} from "../models/attendance.model";
import { ApiError } from "../utils/apiError.util";

export const AttendanceService = {
  generateSessionId(courseId: string, sectionId: string): string {
    const sessionDate = new Date()
      .toLocaleDateString("en-IN")
      .split("/")
      .join("-");
    return `${sessionDate}_${courseId}_${sectionId}`;
  },

  generateQRToken(): string {
    return crypto.randomBytes(16).toString("hex");
  },

  async createAttendanceSession(data: GenerateQRData) {
    const { sectionId, courseId, teacherId, durationMinutes = 30 } = data;
    const sessionDate = new Date()
      .toLocaleDateString("en-IN")
      .split("/")
      .join("-");
    const sessionId = AttendanceService.generateSessionId(courseId, sectionId);
    const qrToken = AttendanceService.generateQRToken();

    // Set expiration time
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const sessionData = {
      courseId,
      sectionId,
      teacherId,
      sessionDate,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: expiresAt,
      status: "active",
      qrToken,
      durationMinutes,
    };

    await db.runTransaction(async (transaction) => {
      // Create attendance session document
      transaction.set(
        db.collection("attendance_sessions").doc(sessionId),
        sessionData
      );

      // Create/update course-section document
      transaction.set(
        db.collection(`course_sections`).doc(`${courseId}_${sectionId}`),
        {
          courseId,
          sectionId,
          teacherId,
          lastClass: sessionDate,
          totalSessions: FieldValue.increment(1),
        },
        { merge: true }
      );
    });

    return { sessionId, qrToken };
  },

  async validateSession(sessionId: string, qrToken: string) {
    const sessionDoc = await db
      .collection("attendance_sessions")
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      throw new ApiError(404, "Session not found");
    }

    const sessionData = sessionDoc.data();

    if (sessionData?.qrToken !== qrToken) {
      throw new ApiError(400, "Invalid QR code");
    }

    if (sessionData?.expiresAt && sessionData.expiresAt.toDate() < new Date()) {
      throw new ApiError(400, "QR code expired");
    }

    if (sessionData?.status !== "active") {
      throw new ApiError(400, "Session ended");
    }

    return sessionData;
  },

  async checkExistingAttendance(sessionId: string, studentId: string) {
    const existingAttendee = await db
      .collection("attendance_sessions")
      .doc(sessionId)
      .collection("attendees")
      .doc(studentId)
      .get();

    if (existingAttendee.exists) {
      throw new ApiError(400, "Already marked present");
    }
  },

  async markAttendance(data: SubmitScanData) {
    const { sessionId, studentId, qrToken } = data;

    await db.runTransaction(async (transaction) => {
      // Validate session
      const sessionData = await AttendanceService.validateSession(
        sessionId,
        qrToken
      );

      // Check if already attended
      await AttendanceService.checkExistingAttendance(sessionId, studentId);

      const summaryRef = db.collection("attendance_summary").doc(studentId);

      // Mark attendance in session
      transaction.set(
        db
          .collection("attendance_sessions")
          .doc(sessionId)
          .collection("attendees")
          .doc(studentId),
        {
          studentId,
          timestamp: FieldValue.serverTimestamp(),
          status: "present",
        },
        { merge: true }
      );

      // Update attendance summary
      transaction.set(
        summaryRef,
        {
          studentId,
          sectionId: sessionData?.sectionId,
        },
        { merge: true }
      );

      transaction.set(
        db
          .collection("attendance_summary")
          .doc(studentId)
          .collection("courses")
          .doc(sessionData.courseId),
        {
          courseId: sessionData.courseId,
          sessionsAttended: FieldValue.increment(1),
        },
        { merge: true }
      );
    });
  },

  async closeAttendanceSession(data: CloseSessionData) {
    const { sessionId, teacherId } = data;

    await db.runTransaction(async (transaction) => {
      const sessionDoc = await transaction.get(
        db.collection("attendance_sessions").doc(sessionId)
      );

      if (!sessionDoc.exists) {
        throw new ApiError(404, "Session not found");
      }

      const sessionData = sessionDoc.data();

      // Verify teacher owns this session
      if (sessionData?.teacherId !== teacherId) {
        throw new ApiError(403, "Unauthorized to close this session");
      }

      if (sessionData?.status !== "active") {
        throw new ApiError(400, "Session is already closed");
      }

      // Close the session
      transaction.update(db.collection("attendance_sessions").doc(sessionId), {
        status: "closed",
        closedAt: FieldValue.serverTimestamp(),
        closedBy: "teacher",
      });
    });
  },
};
