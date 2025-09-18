# KIIT SMA Backend

Backend for KIIT SMA with:
- Express (REST APIs)
- Socket.IO (real-time chat)
- Firebase Admin (Auth + Firestore)
- Vercel AI SDK (tool-calling, no persistence)
- Bun runtime

Key files:
- App entry: [src/index.ts](src/index.ts) → [src/app.ts](src/app.ts)
- Socket.IO: [src/socket.ts](src/socket.ts)
- Firebase Admin: [src/config/firebase.config.ts](src/config/firebase.config.ts)
- AI Chat Service: [src/services/ai.service.ts](src/services/ai.service.ts)
- Chat REST: [src/routes/chat.route.ts](src/routes/chat.route.ts), [src/controllers/chat.controller.ts](src/controllers/chat.controller.ts), [src/services/chat.service.ts](src/services/chat.service.ts)
- Attendance: [src/routes/attendance.route.ts](src/routes/attendance.route.ts), [src/controllers/attendance.controller.ts](src/controllers/attendance.controller.ts), [src/services/attendance.service.ts](src/services/attendance.service.ts)

## Prerequisites

- Bun v1.2+ (recommended runtime)
- Node.js 18+ (optional, for tooling)
- Firebase project with:
  - Firestore enabled
  - Service Account Key (Admin SDK)
- Google Generative AI API key

## Setup

1) Clone and install
```bash
git clone <your-repo-url>
cd kiit-sma-backend
bun install
```

2) Firebase Admin credentials
- Create a service account key in Firebase Console:
  - Settings → Service accounts → “Generate new private key”
- Save the JSON as: `./serviceAccountKey.json` (this file is gitignored)

3) Environment variables
Create `.env` (use `.env.example` as reference):
```env
GOOGLE_GENERATIVE_AI_API_KEY="your-google-genai-key"
# Optional for Socket.IO CORS (comma separated list)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
# Optional
PORT=8080
```

4) Firestore rules (dev)
- Ensure Firestore is in test mode or rules permit your development usage.

## Run (Dev)

Use Bun to run and watch:
```bash
bun run src/index.ts
# or
bun run dev
```

Server starts on http://localhost:${PORT:-8080}.

Health check:
```bash
curl http://localhost:8080/api/v1/healthcheck
```

## Authentication

All protected routes expect a Firebase ID token:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

To generate test ID tokens in dev, you can:
- Sign in from your Flutter app using Firebase Auth and call `user.getIdToken()`
- Or generate a custom token via Admin SDK and exchange it using the Identity Toolkit REST API (see Firebase docs)

## REST Endpoints

- Health
  - GET `/api/v1/healthcheck`

- AI (stateless, no history)
  - POST `/api/v1/ai/chat`
    - Body: `{ "message": "What's my attendance?" }`
    - Auth: Firebase ID token
    - Controller: [src/controllers/ai.controller.ts](src/controllers/ai.controller.ts)
    - Service: [src/services/ai.service.ts](src/services/ai.service.ts)

- Chat
  - POST `/api/v1/chat/users` (create or upsert user profile)
  - GET `/api/v1/chat/rooms` (list rooms for current user)
  - POST `/api/v1/chat/rooms` (create a room; body: `{ otherUserId, sectionId }`)
  - GET `/api/v1/chat/rooms/:roomId/messages?limit=50&lastMessageId=...`
  - Routes: [src/routes/chat.route.ts](src/routes/chat.route.ts)
  - Controller: [src/controllers/chat.controller.ts](src/controllers/chat.controller.ts)
  - Service: [src/services/chat.service.ts](src/services/chat.service.ts)

- Attendance
  - POST `/api/v1/attendance/generate-qr`
  - POST `/api/v1/attendance/submit-scan`
  - Controller: [src/controllers/attendance.controller.ts](src/controllers/attendance.controller.ts)
  - Service: [src/services/attendance.service.ts](src/services/attendance.service.ts)

## Socket.IO (Real-time chat)

Server is initialized in [src/socket.ts](src/socket.ts) with auth middleware [src/utils/socketAuth.util.ts](src/utils/socketAuth.util.ts). The Socket handshake must include the Firebase ID token:

Client connection (Node example):
```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:8080", {
  auth: { token: "<FIREBASE_ID_TOKEN>" }, // or headers: { token: "<ID_TOKEN>" }
});

socket.on("connect", () => {
  console.log("connected", socket.id);

  // Join a room
  socket.emit("join_room", { roomId: "<ROOM_ID>" });

  // Send a message
  socket.emit("send_message", { roomId: "<ROOM_ID>", content: "Hello!" });
});

socket.on("room_joined", ({ roomId }) => console.log("joined", roomId));
socket.on("new_message", (msg) => console.log("message", msg));
socket.on("error", (e) => console.error(e));
```

Server events:
- `join_room` → validates access and joins a specific room
- `send_message` → persists to Firestore and emits `new_message` to the room
- Typing indicators: `typing_start`, `typing_stop`

## AI Chat (Stateless)

- No conversation history is stored.
- Frontend (Flutter) sends a single `message` string and receives a single `message` response.
- Tools auto-inject the authenticated `userId` on the server.

Request:
```bash
curl -X POST http://localhost:8080/api/v1/ai/chat \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "message": "What is my attendance?" }'
```

Response (shape):
```json
{
  "statusCode": 200,
  "data": {
    "message": "Your attendance is ...",
    "success": true,
    "toolCallsUsed": 1
  },
  "message": "AI response generated successfully",
  "success": true
}
```

Implementation:
- Controller: [src/controllers/ai.controller.ts](src/controllers/ai.controller.ts)
- Service (tools, Gemini model): [src/services/ai.service.ts](src/services/ai.service.ts)

Note: Vercel AI SDK does not persist anything by itself. Since you do not want history, nothing else is needed.

## Seeding Example Data (Fees)

A helper script is provided: [seedfees.ts](seedfees.ts). It writes test fee data into Firestore.

Run with Bun:
```bash
bun run seedfees.ts
```

Make sure:
- `serviceAccountKey.json` exists
- Firestore is enabled
- Update `STUDENT_ID` inside the file if needed

## Configuration

- Port: `PORT` (default 8080)
- Socket.IO CORS: `ALLOWED_ORIGINS` (comma-separated)
- Google GenAI: `GOOGLE_GENERATIVE_AI_API_KEY`
- Firebase Admin service account: `./serviceAccountKey.json`

## Troubleshooting

- “No token provided” (Socket):
  - Ensure you pass `auth: { token: "<ID_TOKEN>" }` or `headers: { token: "<ID_TOKEN>" }` on connect.
- “Invalid authentication token” (REST):
  - Verify `Authorization: Bearer <ID_TOKEN>` header and token freshness.
- Firestore permission errors:
  - Check Firebase rules and service account permissions.
- Missing `serviceAccountKey.json`:
  - Place the Admin SDK JSON at the project root; the filename must match.

---
Built with Bun + Express + Firebase Admin + Socket.IO + Vercel AI SDK.# KIIT SMA Backend

Backend for KIIT SMA with:
- Express (REST APIs)
- Socket.IO (real-time chat)
- Firebase Admin (Auth + Firestore)
- Vercel AI SDK (tool-calling, no persistence)
- Bun runtime

Key files:
- App entry: [src/index.ts](src/index.ts) → [src/app.ts](src/app.ts)
- Socket.IO: [src/socket.ts](src/socket.ts)
- Firebase Admin: [src/config/firebase.config.ts](src/config/firebase.config.ts)
- AI Chat Service: [src/services/ai.service.ts](src/services/ai.service.ts)
- Chat REST: [src/routes/chat.route.ts](src/routes/chat.route.ts), [src/controllers/chat.controller.ts](src/controllers/chat.controller.ts), [src/services/chat.service.ts](src/services/chat.service.ts)
- Attendance: [src/routes/attendance.route.ts](src/routes/attendance.route.ts), [src/controllers/attendance.controller.ts](src/controllers/attendance.controller.ts), [src/services/attendance.service.ts](src/services/attendance.service.ts)

## Prerequisites

- Bun v1.2+ (recommended runtime)
- Node.js 18+ (optional, for tooling)
- Firebase project with:
  - Firestore enabled
  - Service Account Key (Admin SDK)
- Google Generative AI API key

## Setup

1) Clone and install
```bash
git clone <your-repo-url>
cd kiit-sma-backend
bun install
```

2) Firebase Admin credentials
- Create a service account key in Firebase Console:
  - Settings → Service accounts → “Generate new private key”
- Save the JSON as: `./serviceAccountKey.json` (this file is gitignored)

3) Environment variables
Create `.env` (use `.env.example` as reference):
```env
GOOGLE_GENERATIVE_AI_API_KEY="your-google-genai-key"
# Optional for Socket.IO CORS (comma separated list)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
# Optional
PORT=8080
```

4) Firestore rules (dev)
- Ensure Firestore is in test mode or rules permit your development usage.

## Run (Dev)

Use Bun to run and watch:
```bash
bun run src/index.ts
# or
bun run dev
```

Server starts on http://localhost:${PORT:-8080}.

Health check:
```bash
curl http://localhost:8080/api/v1/healthcheck
```

## Authentication

All protected routes expect a Firebase ID token:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

To generate test ID tokens in dev, you can:
- Sign in from your Flutter app using Firebase Auth and call `user.getIdToken()`
- Or generate a custom token via Admin SDK and exchange it using the Identity Toolkit REST API (see Firebase docs)

## REST Endpoints

- Health
  - GET `/api/v1/healthcheck`

- AI (stateless, no history)
  - POST `/api/v1/ai/chat`
    - Body: `{ "message": "What's my attendance?" }`
    - Auth: Firebase ID token
    - Controller: [src/controllers/ai.controller.ts](src/controllers/ai.controller.ts)
    - Service: [src/services/ai.service.ts](src/services/ai.service.ts)

- Chat
  - POST `/api/v1/chat/users` (create or upsert user profile)
  - GET `/api/v1/chat/rooms` (list rooms for current user)
  - POST `/api/v1/chat/rooms` (create a room; body: `{ otherUserId, sectionId }`)
  - GET `/api/v1/chat/rooms/:roomId/messages?limit=50&lastMessageId=...`
  - Routes: [src/routes/chat.route.ts](src/routes/chat.route.ts)
  - Controller: [src/controllers/chat.controller.ts](src/controllers/chat.controller.ts)
  - Service: [src/services/chat.service.ts](src/services/chat.service.ts)

- Attendance
  - POST `/api/v1/attendance/generate-qr`
  - POST `/api/v1/attendance/submit-scan`
  - Controller: [src/controllers/attendance.controller.ts](src/controllers/attendance.controller.ts)
  - Service: [src/services/attendance.service.ts](src/services/attendance.service.ts)

## Socket.IO (Real-time chat)

Server is initialized in [src/socket.ts](src/socket.ts) with auth middleware [src/utils/socketAuth.util.ts](src/utils/socketAuth.util.ts). The Socket handshake must include the Firebase ID token:

Client connection (Node example):
```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:8080", {
  auth: { token: "<FIREBASE_ID_TOKEN>" }, // or headers: { token: "<ID_TOKEN>" }
});

socket.on("connect", () => {
  console.log("connected", socket.id);

  // Join a room
  socket.emit("join_room", { roomId: "<ROOM_ID>" });

  // Send a message
  socket.emit("send_message", { roomId: "<ROOM_ID>", content: "Hello!" });
});

socket.on("room_joined", ({ roomId }) => console.log("joined", roomId));
socket.on("new_message", (msg) => console.log("message", msg));
socket.on("error", (e) => console.error(e));
```

Server events:
- `join_room` → validates access and joins a specific room
- `send_message` → persists to Firestore and emits `new_message` to the room
- Typing indicators: `typing_start`, `typing_stop`

## AI Chat (Stateless)

- No conversation history is stored.
- Frontend (Flutter) sends a single `message` string and receives a single `message` response.
- Tools auto-inject the authenticated `userId` on the server.

Request:
```bash
curl -X POST http://localhost:8080/api/v1/ai/chat \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "message": "What is my attendance?" }'
```

Response (shape):
```json
{
  "statusCode": 200,
  "data": {
    "message": "Your attendance is ...",
    "success": true,
    "toolCallsUsed": 1
  },
  "message": "AI response generated successfully",
  "success": true
}
```

Implementation:
- Controller: [src/controllers/ai.controller.ts](src/controllers/ai.controller.ts)
- Service (tools, Gemini model): [src/services/ai.service.ts](src/services/ai.service.ts)

Note: Vercel AI SDK does not persist anything by itself. Since you do not want history, nothing else is needed.

## Seeding Example Data (Fees)

A helper script is provided: [seedfees.ts](seedfees.ts). It writes test fee data into Firestore.

Run with Bun:
```bash
bun run seedfees.ts
```

Make sure:
- `serviceAccountKey.json` exists
- Firestore is enabled
- Update `STUDENT_ID` inside the file if needed

## Configuration

- Port: `PORT` (default 8080)
- Socket.IO CORS: `ALLOWED_ORIGINS` (comma-separated)
- Google GenAI: `GOOGLE_GENERATIVE_AI_API_KEY`
- Firebase Admin service account: `./serviceAccountKey.json`

## Troubleshooting

- “No token provided” (Socket):
  - Ensure you pass `auth: { token: "<ID_TOKEN>" }` or `headers: { token: "<ID_TOKEN>" }` on connect.
- “Invalid authentication token” (REST):
  - Verify `Authorization: Bearer <ID_TOKEN>` header and token freshness.
- Firestore permission errors:
  - Check Firebase rules and service account permissions.
- Missing `serviceAccountKey.json`:
  - Place the Admin SDK JSON at the project root; the filename must match.

---
Built with Bun + Express + Firebase Admin + Socket.IO + Vercel AI SDK.
