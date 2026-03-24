import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";

// Middleware imports
import { requestMiddleware } from "./middleware/request_middleware.ts";
import errorLogger from "./middleware/error_logger.ts";
import { errorResponder } from "./middleware/error_responder.ts";
import { generalRateLimiter } from "./middleware/rate_limiter.ts";

// Router imports
import authRouter from "./modules/auth/auth.router.ts";
import * as routers from "./routers/index.ts";
import { connectDB } from "./utils/db/connectDB.ts";
import { subscriptionTypeService } from "./modules/subscription_type/subscription_type.service.ts";
import { authService } from "./modules/auth/auth.service.ts";

/* ---------- Environment Variables ---------- */

const PORT = process.env.PORT || 8080;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "https://app.test.local";
const NODE_ENV = process.env.NODE_ENV || "development";

/* ---------- Express App ---------- */

const app = express();

/* ---------- Security Middleware ---------- */

// Helmet for security headers
const helmetConfig =
  NODE_ENV === "production" ? {} : { contentSecurityPolicy: false };
app.use(helmet(helmetConfig));

// CORS configuration
app.use(
  cors({
    origin: CORS_ORIGIN.split(","),
    credentials: true, // Allow cookies
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  }),
);

// Cookie parser
app.use(cookieParser());

// Global rate limiter
app.use(generalRateLimiter);

/* ---------- Body Parsing ---------- */

// Raw body for Stripe webhook (must be before json parser for this route)
app.use("/api/v1/billing/webhook", express.raw({ type: "application/json" }));

// JSON body parser for all other routes
app.use(express.json({ limit: "10mb" }));

// URL encoded body parser
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ---------- Request Logging ---------- */

app.use(requestMiddleware);

/* ---------- Health Check ---------- */

app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    status: "success",
    message: "Server running properly",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

/* ---------- API Routes (v1) ---------- */

const apiV1 = "/api/v1";

// Authentication routes
app.use(`${apiV1}/auth`, authRouter);

// User management routes
app.use(`${apiV1}/users`, routers.userRouter);

// Organization routes
app.use(`${apiV1}/organizations`, routers.organizationRouter);

// Billing routes
app.use(`${apiV1}/billing`, routers.billingRouter);

// Customer routes
app.use(`${apiV1}/customers`, routers.customerRouter);

// Material routes (catalog, instances)
app.use(`${apiV1}/materials`, routers.materialRouter);

// Location routes (physical locations / sedes)
app.use(`${apiV1}/locations`, routers.locationRouter);

// Transfer routes
app.use(`${apiV1}/transfers`, routers.transferRouter);

// Package routes
app.use(`${apiV1}/packages`, routers.packageRouter);

// Request routes (loan requests)
app.use(`${apiV1}/requests`, routers.requestRouter);

// Loan routes
app.use(`${apiV1}/loans`, routers.loanRouter);

// Inspection routes
app.use(`${apiV1}/inspections`, routers.inspectionRouter);

// Invoice routes
app.use(`${apiV1}/invoices`, routers.invoiceRouter);

// Subscription type routes (super admin management)
app.use(`${apiV1}/subscription-types`, routers.subscriptionTypeRouter);

// Admin routes (super admin analytics)
app.use(`${apiV1}/admin`, routers.adminRouter);

// Role management routes
app.use(`${apiV1}/roles`, routers.rolesRouter);

// Permission management routes
app.use(`${apiV1}/permissions`, routers.permissionsRouter);

// Pricing configuration routes
app.use(`${apiV1}/pricing`, routers.pricingRouter);

/* ---------- 404 Handler ---------- */

app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    status: "error",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

/* ---------- Error Handling ---------- */

app.use(errorLogger);
app.use(errorResponder);

/* ---------- Start Server ---------- */

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    // Seed default subscription types if none exist
    await subscriptionTypeService.seedDefaults();

    // Schedule background cleanup of expired pending-email-verification registrations
    setInterval(() => {
      authService.purgeExpiredPendingRegistrations().catch((err: unknown) => {
        console.error("Failed to purge expired pending registrations:", err);
      });
    }, 60 * 1000);

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 API endpoint: http://localhost:${PORT}/api/v1`);
      console.log(`🔧 Environment: ${NODE_ENV}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
