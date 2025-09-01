import type { Request, Response } from "express";
import { AttendanceService } from "../services/attendance.service";
import { ApiResponse } from "../utils/apiResponse.util";
import { asyncHandler } from "../utils/asyncHandler.util";

const generateQR = asyncHandler(async (req: Request, res: Response) => {
  const { sectionId, courseId, teacherId, durationMinutes = 30 } = req.body;

  const result = await AttendanceService.createAttendanceSession({
    sectionId,
    courseId,
    teacherId,
    durationMinutes,
  });

  res.status(200).json(new ApiResponse(200, result, "QR Data Sent"));
});

const submitScan = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, studentId, qrToken } = req.body;
  // const studentId = req.user.uid; // from auth middleware

  await AttendanceService.markAttendance({
    sessionId,
    studentId,
    qrToken,
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, "Scan Submitted Successfully"));
});

const closeSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, teacherId } = req.body;

  await AttendanceService.closeAttendanceSession({
    sessionId,
    teacherId,
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, "Session closed successfully"));
});

export { generateQR, submitScan, closeSession };
