import type { Socket } from "socket.io";
import { auth, db } from "../config/firebase.config";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: "student" | "teacher";
  userSections?: string[];
}

const socketAuth = async (
  socket: AuthenticatedSocket,
  next: (err?: Error) => void
) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.token;

    if (!token) {
      return next(new Error("No token provided"));
    }

    const decodedToken = await auth.verifyIdToken(token);

    // Fetch user data from Firestore
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return next(new Error("User not found"));
    }

    const userData = userDoc.data();
    socket.userId = decodedToken.uid;
    socket.userRole = userData?.role;
    socket.userSections = userData?.sections || [];

    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
};

export { socketAuth, type AuthenticatedSocket };
