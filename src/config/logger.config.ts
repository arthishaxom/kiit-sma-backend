import winston from "winston";

const { combine, timestamp, errors, prettyPrint } = winston.format;

export const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), errors({ stack: true }), prettyPrint()),
  transports: [new winston.transports.Console()],
});
