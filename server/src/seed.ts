import { prisma } from "./db";

const testAccountEmail = "test@example.com";
const seedSurveyTitle = "Sample Customer Feedback Survey";
const seedSurveyDescription =
  "Development seed survey for testing the survey API.";

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: testAccountEmail },
    select: { id: true },
  });

  if (!user) {
    throw new Error(
      `No account found for ${testAccountEmail}. Sign up with this account before running the seed.`,
    );
  }

  const existingSurvey = await prisma.survey.findFirst({
    where: {
      ownerId: user.id,
      title: seedSurveyTitle,
      description: seedSurveyDescription,
    },
    select: { id: true },
  });

  if (existingSurvey) {
    console.info(`Seed survey already exists: ${existingSurvey.id}`);
    return;
  }

  const survey = await prisma.survey.create({
    data: {
      title: seedSurveyTitle,
      description: seedSurveyDescription,
      ownerId: user.id,
      questions: {
        create: [
          {
            text: "How satisfied are you with your experience?",
            type: "rating",
            isRequired: true,
            sortOrder: 0,
          },
          {
            text: "What did you like most?",
            type: "text",
            sortOrder: 1,
          },
          {
            text: "What could we improve?",
            type: "text",
            sortOrder: 2,
          },
        ],
      },
    },
    select: { id: true, title: true },
  });

  console.info(`Created seed survey "${survey.title}" (${survey.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });