import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { AIService } from "../services/ai.service";
import { ApiResponse } from "../utils/apiResponse.util";
import { asyncHandler } from "../utils/asyncHandler.util";

const chatWithAI = asyncHandler(
	async (req: AuthenticatedRequest, res: Response) => {
		const { message } = req.body;
		const userId = req.user?.uid;

		if (!message) {
			res
				.status(400)
				.json(new ApiResponse(400, null, "Message Query is required"));
			return;
		}

		if (!userId) {
			res.status(400).json(new ApiResponse(400, null, "User ID is required"));
			return;
		}

		const result = await AIService.generateChatResponse(message, userId);

		res
			.status(200)
			.json(new ApiResponse(200, result, "AI response generated successfully"));
	},
);

export { chatWithAI };
