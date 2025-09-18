import { Router } from "express";
import { chatWithAI, } from "../controllers/ai.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

// Apply auth middleware to all AI routes
router.use(verifyToken);

// AI chat endpoint
router.post("/chat", chatWithAI);


export default router;
