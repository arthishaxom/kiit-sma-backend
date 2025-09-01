import type { NextFunction, Request, Response } from "express";
import { auth } from "../config/firebase.config";
import { ApiError } from "../utils/apiError.util";
import { asyncHandler } from "../utils/asyncHandler.util";

interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    [key: string]: any;
  };
}

const verifyToken = asyncHandler(
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split("Bearer ")[1];

    if (!token) {
      throw new ApiError(401, "No authentication token provided");
    }

    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      throw new ApiError(401, "Invalid authentication token");
    }
  }
);

export { verifyToken, type AuthenticatedRequest };
