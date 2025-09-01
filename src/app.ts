import express from "express";
import { globalErrorHandler } from "./middlewares/errorHandler.middleware";
import { notFoundHandler } from "./middlewares/notFound.middleware";
import attendanceRouter from "./routes/attendance.route";
import chatRouter from "./routes/chat.route";
import healthcheckRouter from "./routes/healthcheck.route";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/attendance", attendanceRouter);
app.use("/api/v1/chat", chatRouter);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
