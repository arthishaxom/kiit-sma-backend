import type { Server as HTTPServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "./config/logger.config";
import { ChatService } from "./services/chat.service";
import { type AuthenticatedSocket, socketAuth } from "./utils/socketAuth.util";

let io: SocketIOServer;

const initializeSocket = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || ["*"],
      methods: ["GET", "POST"],
    },
  });

  // Socket authentication middleware
  io.use(socketAuth);

  // Socket.IO connection handling
  io.on("connection", (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected`);

    // Update user online status
    if (socket.userId) {
      ChatService.updateUserOnlineStatus(socket.userId, true);
    }

    // Join user to their chat rooms
    socket.on("join_room", async (data) => {
      try {
        const { roomId } = data;
        if (!socket.userId || !roomId) return;

        const canAccess = await ChatService.validateUserCanAccessRoom(
          socket.userId,
          roomId
        );

        if (!canAccess) {
          socket.emit("error", {
            message: "Unauthorized to join this room",
          });
          return;
        }

        socket.join(roomId);
        socket.emit("room_joined", { roomId });
      } catch (error) {
        logger.error("Failed to join rooms:", error);
        socket.emit("error", { message: "Failed to join rooms" });
      }
    });

    // Handle new messages
    socket.on("send_message", async (data) => {
      try {
        const { roomId, content } = data;

        if (!socket.userId) return;

        // Validate user can send to this room
        const canSend = await ChatService.validateUserCanAccessRoom(
          socket.userId,
          roomId
        );
        if (!canSend) {
          socket.emit("error", {
            message: "Unauthorized to send to this room",
          });
          return;
        }

        // Save message and broadcast
        const message = await ChatService.saveMessage(
          roomId,
          socket.userId,
          content
        );

        // Broadcast to room
        io.to(roomId).emit("new_message", message);
      } catch (error) {
        logger.error("Send message error:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Handle typing indicators
    socket.on("typing_start", (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.to(roomId).emit("user_typing", {
          userId: socket.userId,
          isTyping: true,
        });
      }
    });

    socket.on("typing_stop", (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.to(roomId).emit("user_typing", {
          userId: socket.userId,
          isTyping: false,
        });
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      logger.info(`User ${socket.userId} disconnected`);
      if (socket.userId) {
        ChatService.updateUserOnlineStatus(socket.userId, false);
      }
    });
  });

  logger.info("Socket.IO initialized successfully");
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized");
  }
  return io;
};

export { initializeSocket, getIO };
