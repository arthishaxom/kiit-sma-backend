interface GenerateQRData {
  sectionId: string;
  courseId: string;
  teacherId: string;
  durationMinutes?: number;
}

interface SubmitScanData {
  sessionId: string;
  studentId: string;
  qrToken: string;
}

interface CloseSessionData {
  sessionId: string;
  teacherId: string;
}

export type { GenerateQRData, SubmitScanData, CloseSessionData };
