import { connect } from "mongoose";
import { logger } from "../logger.ts";
import { AppError } from "../../errors/AppError.ts";

export const connectDB = async () => {
  try {
    const connectionString =
      process.env.MONGODB_URI || process.env.DB_CONNECTION_STRING || null;

    // Throw error if no connection string stablished
    if (!connectionString) {
      logger.error(connectionString);
      throw AppError.internal("No se ha establecido una cadena de conexión a la base de datos");
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
