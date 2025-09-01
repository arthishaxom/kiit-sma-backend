import "dotenv/config";
import { createServer } from "node:http";
import app from "./app";
import { logger } from "./config/logger.config";
import { initializeSocket } from "./socket";

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    const server = createServer(app);
    initializeSocket(server);
    server.listen(PORT, () => {
      logger.info(`Server is listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Error starting server:", error);
    process.exit(1);
  }
};

startServer();
