import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requiredAuth } from "../middleware/requiredAuth";

export const surveyRouter = Router();

const createSurveySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
});

const updateSurveySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((survey) => Object.keys(survey).length > 0, {
    message: "At least one field must be provided",
  });

surveyRouter.use(requiredAuth);

surveyRouter.post("/", async (req, res) => {
  const input = createSurveySchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: "Invalid survey details",
      details: input.error.flatten().fieldErrors,
    });
  }

  const ownerId = req.user?.id;
  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const survey = await prisma.survey.create({
    data: {
      ...input.data,
      ownerId,
    },
  });

  return res.status(201).json({ survey });
});

surveyRouter.get("/", async (req, res) => {
  const ownerId = req.user?.id;
  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const surveys = await prisma.survey.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          questions: true,
          submissions: true,
        },
      },
    },
  });

  return res.status(200).json({ surveys });
});

surveyRouter.get("/:surveyId", async (req, res) => {
  const ownerId = req.user?.id;
  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const survey = await prisma.survey.findFirst({
    where: {
      id: req.params.surveyId,
      ownerId,
    },
    include: {
      questions: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!survey) {
    return res.status(404).json({ error: "Survey not found" });
  }

  return res.status(200).json({ survey });
});

surveyRouter.patch("/:surveyId", async (req, res) => {
  const input = updateSurveySchema.safeParse(req.body);
  if (!input.success) {
    return res.status(400).json({
      error: "Invalid survey details",
      details: input.error.flatten().fieldErrors,
    });
  }

  const ownerId = req.user?.id;
  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const updated = await prisma.survey.updateMany({
    where: {
      id: req.params.surveyId,
      ownerId,
    },
    data: input.data,
  });

  if (updated.count === 0) {
    return res.status(404).json({ error: "Survey not found" });
  }

  const survey = await prisma.survey.findFirst({
    where: {
      id: req.params.surveyId,
      ownerId,
    },
  });

  if (!survey) {
    return res.status(404).json({ error: "Survey not found" });
  }

  return res.status(200).json({ survey });
});

surveyRouter.delete("/:surveyId", async (req, res) => {
  const ownerId = req.user?.id;
  if (!ownerId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const deleted = await prisma.survey.deleteMany({
    where: {
      id: req.params.surveyId,
      ownerId,
    },
  });

  if (deleted.count === 0) {
    return res.status(404).json({ error: "Survey not found" });
  }

  return res.status(204).end();
});
