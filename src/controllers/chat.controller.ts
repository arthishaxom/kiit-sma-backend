import type { Response } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { ChatService } from "../services/chat.service";
import { ApiResponse } from "../utils/apiResponse.util";
import { asyncHandler } from "../utils/asyncHandler.util";

const createUser = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, email, role, sections } = req.body; // Changed to sections array
    const uid = req.user!.uid;

    await ChatService.createUser(uid, { name, email, role, sections });

    res
      .status(201)
      .json(new ApiResponse(201, null, "User created successfully"));
  }
);

const getChatRooms = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.uid;
    const rooms = await ChatService.getUserChatRooms(userId);

    res
      .status(200)
      .json(new ApiResponse(200, { rooms }, "Chat rooms fetched successfully"));
  }
);

const getRoomMessages = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { roomId } = req.params;
    const userId = req.user!.uid;
    const limit = parseInt(req.query.limit as string) || 50;
    const lastMessageId = req.query.lastMessageId as string;

    if (!roomId || typeof roomId !== "string") {
      res
        .status(400)
        .json(new ApiResponse(400, null, "roomId parameter is required"));
      return;
    }

    const messages = await ChatService.getRoomMessages(
      roomId,
      userId,
      limit,
      lastMessageId
    );

    res
      .status(200)
      .json(
        new ApiResponse(200, { messages }, "Messages fetched successfully")
      );
  }
);

// Updated to handle both teacher and student initiated chats
const createChatRoom = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const { otherUserId, sectionId } = req.body; // Generic "otherUserId" instead of specific role
    const currentUserId = req.user?.uid;

    if (!currentUserId || !otherUserId || !sectionId) {
      const missingFields = [];
      if (!currentUserId) missingFields.push("currentUserId");
      if (!otherUserId) missingFields.push("otherUserId");
      if (!sectionId) missingFields.push("sectionId");

      res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Missing required fields: ${missingFields.join(", ")}`
          )
        );
      return;
    }

    const roomId = await ChatService.createChatRoom(
      currentUserId,
      otherUserId,
      sectionId
    );

    res
      .status(201)
      .json(new ApiResponse(201, { roomId }, "Chat room created successfully"));
  }
);

// Updated to get available users based on current user's role
const getAvailableUsers = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.uid;
    const { sectionId } = req.query; // Optional section filter

    if (!userId) {
      res
        .status(400)
        .json(new ApiResponse(400, null, "userId parameter is required"));
      return;
    }

    const users = await ChatService.getAvailableUsersForChat(
      userId,
      sectionId as string
    );

    res
      .status(200)
      .json(
        new ApiResponse(200, { users }, "Available users fetched successfully")
      );
  }
);

export {
  createUser,
  getChatRooms,
  getRoomMessages,
  createChatRoom,
  getAvailableUsers, // Renamed from getTeachers
};
