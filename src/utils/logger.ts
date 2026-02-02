import { createLogger, format, transports } from "winston";

const logger = createLogger({
  level: "warn",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/mixed.log" }),
  ],
});

export default logger;
