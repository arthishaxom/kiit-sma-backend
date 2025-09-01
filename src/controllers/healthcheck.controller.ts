import type { Request, Response } from "express";
import { ApiResponse } from "../utils/apiResponse.util";
import { asyncHandler } from "../utils/asyncHandler.util";

const healthcheck = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(new ApiResponse(200, "OK", "SMA Health check passed"));
});

export { healthcheck };
