import { FieldValue, type Query } from "firebase-admin/firestore";
import { db } from "../config/firebase.config";
import { ApiError } from "../utils/apiError.util";

export const ChatService = {
  async createUser(
    uid: string,
    userData: {
      name: string;
      email: string;
      role: "student" | "teacher";
      sections: string[]; // Changed to array
    }
  ) {
    try {
      await db
        .collection("users")
        .doc(uid)
        .set({
          ...userData,
          createdAt: FieldValue.serverTimestamp(),
          isOnline: false,
          lastSeen: FieldValue.serverTimestamp(),
        });
      return true;
    } catch (error) {
      throw new ApiError(500, "Failed to create user");
    }
  },

  async getUserChatRooms(userId: string) {
    try {
      // Get user data first to determine role
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new ApiError(404, "User not found");
      }

      const userRole = userDoc.data()?.role;
      let query: Query;

      if (userRole === "student") {
        query = db.collection("chatRooms").where("studentId", "==", userId);
      } else if (userRole === "teacher") {
        query = db.collection("chatRooms").where("teacherId", "==", userId);
      } else {
        throw new ApiError(400, "Invalid user role");
      }

      const snapshot = await query.get();

      return Promise.all(
        snapshot.docs.map(async (doc) => {
          const roomData = doc.data();

          // Get other participant's info
          const otherUserId =
            userRole === "student" ? roomData.teacherId : roomData.studentId;
          const otherUserDoc = await db
            .collection("users")
            .doc(otherUserId)
            .get();

          return {
            id: doc.id,
            ...roomData,
            otherUser: otherUserDoc.exists
              ? {
                  id: otherUserId,
                  name: otherUserDoc.data()?.name,
                  role: otherUserDoc.data()?.role,
                  isOnline: otherUserDoc.data()?.isOnline || false,
                }
              : null,
          };
        })
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to fetch chat rooms");
    }
  },

  // Updated to handle both directions and multiple sections
  async createChatRoom(
    currentUserId: string,
    otherUserId: string,
    sectionId: string
  ) {
    try {
      // Get both users' data
      const [currentUserDoc, otherUserDoc] = await Promise.all([
        db.collection("users").doc(currentUserId).get(),
        db.collection("users").doc(otherUserId).get(),
      ]);

      if (!currentUserDoc.exists || !otherUserDoc.exists) {
        throw new ApiError(404, "User not found");
      }

      const currentUserData = currentUserDoc.data();
      const otherUserData = otherUserDoc.data();

      // Validate users have different roles
      if (currentUserData?.role === otherUserData?.role) {
        throw new ApiError(
          400,
          "Cannot create chat between users of same role"
        );
      }

      // Check if both users are in the specified section
      const currentUserSections = currentUserData?.sections || [];
      const otherUserSections = otherUserData?.sections || [];

      if (
        !currentUserSections.includes(sectionId) ||
        !otherUserSections.includes(sectionId)
      ) {
        throw new ApiError(403, "Users not in the specified section");
      }

      // Determine teacher and student IDs
      let teacherId: string, studentId: string;
      if (currentUserData?.role === "teacher") {
        teacherId = currentUserId;
        studentId = otherUserId;
      } else {
        teacherId = otherUserId;
        studentId = currentUserId;
      }

      // Check if room already exists
      const existingRoom = await db
        .collection("chatRooms")
        .where("teacherId", "==", teacherId)
        .where("studentId", "==", studentId)
        .where("sectionId", "==", sectionId)
        .get();

      if (!existingRoom.empty) {
        return existingRoom.docs[0]?.id;
      }

      // Create new room
      const roomData = {
        sectionId,
        teacherId,
        studentId,
        createdAt: FieldValue.serverTimestamp(),
        isActive: true,
        createdBy: currentUserId, // Track who initiated the chat
      };

      const roomRef = await db.collection("chatRooms").add(roomData);
      return roomRef.id;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to create chat room");
    }
  },

  async getRoomMessages(
    roomId: string,
    userId: string,
    limit = 50,
    lastMessageId?: string
  ) {
    try {
      // Validate user access to room
      const roomDoc = await db.collection("chatRooms").doc(roomId).get();
      if (!roomDoc.exists) {
        throw new ApiError(404, "Chat room not found");
      }

      const roomData = roomDoc.data();
      if (roomData?.teacherId !== userId && roomData?.studentId !== userId) {
        throw new ApiError(403, "Access denied to this chat room");
      }

      let query = db
        .collection("messages")
        .doc(roomId)
        .collection("messages")
        .orderBy("timestamp", "desc")
        .limit(limit);

      if (lastMessageId) {
        const lastMessageDoc = await db
          .collection("messages")
          .doc(roomId)
          .collection("messages")
          .doc(lastMessageId)
          .get();
        if (lastMessageDoc.exists) {
          query = query.startAfter(lastMessageDoc);
        }
      }

      const snapshot = await query.get();
      const messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return messages.reverse();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to fetch messages");
    }
  },

  // Updated to get available users based on current user's role and sections
  async getAvailableUsersForChat(currentUserId: string, sectionId?: string) {
    try {
      const currentUserDoc = await db
        .collection("users")
        .doc(currentUserId)
        .get();

      if (!currentUserDoc.exists) {
        throw new ApiError(404, "User not found");
      }

      const currentUserData = currentUserDoc.data();
      const currentUserRole = currentUserData?.role;
      const currentUserSections = currentUserData?.sections || [];

      // Determine what type of users to fetch
      let targetRole: string;
      if (currentUserRole === "student") {
        targetRole = "teacher";
      } else if (currentUserRole === "teacher") {
        targetRole = "student";
      } else {
        throw new ApiError(400, "Invalid user role");
      }

      // Base query for users with opposite role
      const query = db.collection("users").where("role", "==", targetRole);

      const snapshot = await query.get();

      // Filter users by section overlap
      const availableUsers = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          name: doc.data().name,
          email: doc.data().email,
          role: doc.data().role,
          sections: doc.data().sections || [],
          isOnline: doc.data().isOnline || false,
        }))
        .filter((user) => {
          // If sectionId is specified, check if both users are in that section
          if (sectionId) {
            return (
              user.sections.includes(sectionId) &&
              currentUserSections.includes(sectionId)
            );
          }
          // Otherwise, check if there's any section overlap
          return user.sections.some((section: string) =>
            currentUserSections.includes(section)
          );
        })
        .map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isOnline: user.isOnline,
          commonSections: user.sections.filter((section: string) =>
            currentUserSections.includes(section)
          ),
        }));

      return availableUsers;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to fetch available users");
    }
  },

  // Missing method: Update user online status
  async updateUserOnlineStatus(userId: string, isOnline: boolean) {
    try {
      await db.collection("users").doc(userId).update({
        isOnline,
        lastSeen: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to update online status:", error);
      // Don't throw error for online status updates
    }
  },

  // Missing method: Validate user can access room
  async validateUserCanAccessRoom(userId: string, roomId: string) {
    try {
      const roomDoc = await db.collection("chatRooms").doc(roomId).get();

      if (!roomDoc.exists) {
        return false;
      }

      const roomData = roomDoc.data();
      return roomData?.teacherId === userId || roomData?.studentId === userId;
    } catch (error) {
      console.error("Error validating room access:", error);
      return false;
    }
  },

  // Missing method: Save message
  async saveMessage(roomId: string, senderId: string, content: string) {
    try {
      const message = {
        senderId,
        content,
        timestamp: FieldValue.serverTimestamp(),
        type: "text",
      };

      const messageRef = await db
        .collection("messages")
        .doc(roomId)
        .collection("messages")
        .add(message);

      // Update room's last message
      await db
        .collection("chatRooms")
        .doc(roomId)
        .update({
          lastMessage: {
            content,
            senderId,
            timestamp: FieldValue.serverTimestamp(),
          },
        });

      return {
        id: messageRef.id,
        ...message,
        timestamp: Date.now(), // For immediate response
      };
    } catch (error) {
      throw new ApiError(500, "Failed to save message");
    }
  },
};
