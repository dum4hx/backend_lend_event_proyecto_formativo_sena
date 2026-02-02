import { connect } from "mongoose";
import { logger } from "../logger.ts";
import { AppError } from "../types/AppError.ts";

export const connectDB = async () => {
  try {
    const connectionString = process.env.DB_CONNECTION_STRING || null;

    // Throw error if no connection string stablished
    if (!connectionString) {
      throw AppError.internal("No database connection string set");
    }

    logger.info("Connecting to mongoDB");

    await connect(connectionString);

    logger.info("Connected to db successfully");
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw AppError.internal(err.message);
    }
  }
};
