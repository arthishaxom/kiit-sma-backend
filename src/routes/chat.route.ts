import { Router } from "express";
import {
  createChatRoom,
  createUser,
  getAvailableUsers,
  getChatRooms,
  getRoomMessages,
} from "../controllers/chat.controller";
import { verifyToken } from "../middlewares/auth.middleware";

const router = Router();

// Public route for user creation (after Firebase auth)
router.post("/users", verifyToken, createUser);

// Protected routes
router.use(verifyToken);
router.get("/rooms", getChatRooms);
router.post("/rooms", createChatRoom);
router.get("/rooms/:roomId/messages", getRoomMessages);
router.get("/users", getAvailableUsers);

export default router;
