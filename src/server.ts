import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

// Middleware imports
import { requestMiddleware } from "./middleware/request_middleware.ts";
import errorLogger from "./middleware/error_logger.ts";
import { errorResponder } from "./middleware/error_responder.ts";

import { connectDB } from "./utils/db/connectDB.ts";

// Get env variables
const PORT = process.env.PORT || 8080;

const app = express();

app.use(requestMiddleware);

app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({ message: "Server running properly" });
});

app.get("/error", (req: Request, res: Response, next: NextFunction) => {
  throw new Error();
});

// Use error middleware
app.use(errorLogger);
app.use(errorResponder);

app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}. http://localhost:${PORT}/`),
);

await connectDB();
