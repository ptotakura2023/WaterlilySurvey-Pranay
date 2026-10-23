import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { authRouter } from "./auth";
import {surveyRouter} from "./routes/survey";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 5000;

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/surveys", surveyRouter);

app.get("/api/health", (_req, res)=> {
    res.status(200).json({
        status: "ok",
        message:"Waterlily backend is running",
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, ()=> {
    console.log(
        `Waterlily API running at http://localhost:${PORT}`
    );
});