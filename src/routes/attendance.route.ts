import express from "express";
import { generateQR, submitScan } from "../controllers/attendance.controller";

const router = express.Router();

router.route("/generate-qr").post(generateQR);
router.route("/submit-scan").post(submitScan);

export default router;
