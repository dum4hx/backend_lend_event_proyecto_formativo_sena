
import mongoose from "mongoose";
import dotenv from "dotenv";
import { logger } from "../../utils/logger.ts";
import { SubscriptionType } from "../../modules/subscription_type/models/subscription_type.model.ts";

dotenv.config();



const DB_CONNECTION_STRING = process.env.DB_CONNECTION_STRING || "";

if (!DB_CONNECTION_STRING) {
  logger.error("DB_CONNECTION_STRING is not defined in .env file");
  process.exit(1);
}

/**
 * Connects to the database, updates subscription types with Stripe Price IDs,
 * and disconnects.
 */
async function seedStripePrices() {
  try {
    logger.info("Connecting to database...");
    await mongoose.connect(DB_CONNECTION_STRING);
    logger.info("Database connected successfully.");

    const subscriptionTypes = await SubscriptionType.find({});

    if (subscriptionTypes.length === 0) {
      logger.warn("No subscription types found in the database.");
      return;
    }

    let updatedCount = 0;

    for (const subType of subscriptionTypes) {
      const plan = subType.plan;
      logger.info(`Processing plan: ${plan}...`);

      // Generate placeholder IDs based on the plan name
      const newBaseId = `price_${plan.toUpperCase()}_BASE_ID`;
      const newSeatId = `price_${plan.toUpperCase()}_SEAT_ID`;

      // Update only if the IDs are not already set or are different
      if (
        subType.stripePriceIdBase !== newBaseId ||
        subType.stripePriceIdSeat !== newSeatId
      ) {
        const result = await SubscriptionType.updateOne(
          { _id: subType._id },
          {
            $set: {
              stripePriceIdBase: newBaseId,
              stripePriceIdSeat: newSeatId,
            },
          }
        );

        if (result.modifiedCount > 0) {
          logger.info(`Successfully updated plan "${plan}".`);
          updatedCount++;
        } else {
          logger.info(`No update needed for plan "${plan}".`);
        }
      } else {
        logger.info(`Plan "${plan}" already has the correct Stripe IDs.`);
      }
    }

    logger.info(
      `Seeding complete. ${updatedCount} subscription type(s) were updated.`
    );
  } catch (error) {
    logger.error("An error occurred during the seeding process:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("Database connection closed.");
  }
}

seedStripePrices();
