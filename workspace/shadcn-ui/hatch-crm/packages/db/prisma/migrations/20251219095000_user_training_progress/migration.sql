-- CreateTable
CREATE TABLE "UserTrainingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedWalkthroughs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedVideos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "completedQuizzes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "practiceSessionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "practiceAccuracy" DOUBLE PRECISION,
    "totalTrainingTime" INTEGER NOT NULL DEFAULT 0,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "lastTrainingAt" TIMESTAMP(3),
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTrainingProgress_userId_key" ON "UserTrainingProgress"("userId");

-- AddForeignKey
ALTER TABLE "UserTrainingProgress" ADD CONSTRAINT "UserTrainingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

