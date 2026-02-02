import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";

// Get env variables
const PORT = process.env.PORT || 8080;

const app = express();

app.get("/health", (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({ message: "Server running properly" });
});

// Use error middleware
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}. http://localhost:${PORT}/`),
);
