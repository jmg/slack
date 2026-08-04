-- AlterEnum
ALTER TYPE "WaMessageKind" ADD VALUE 'POLL';

-- AlterTable
ALTER TABLE "WaChat" ADD COLUMN     "disappearingSeconds" INTEGER;

-- AlterTable
ALTER TABLE "WaMessage" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT;

-- CreateTable
CREATE TABLE "WaMention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPoll" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "WaPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaPollVote" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaMention_userId_createdAt_idx" ON "WaMention"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaMention_messageId_userId_key" ON "WaMention"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaPoll_messageId_key" ON "WaPoll"("messageId");

-- CreateIndex
CREATE INDEX "WaPollOption_pollId_position_idx" ON "WaPollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "WaPollVote_userId_idx" ON "WaPollVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaPollVote_optionId_userId_key" ON "WaPollVote"("optionId", "userId");

-- CreateIndex
CREATE INDEX "WaMessage_expiresAt_idx" ON "WaMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "WaMessage_chatId_pinnedAt_idx" ON "WaMessage"("chatId", "pinnedAt");

-- CreateIndex
CREATE INDEX "WaMessage_pinnedById_idx" ON "WaMessage"("pinnedById");

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "WaUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMention" ADD CONSTRAINT "WaMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMention" ADD CONSTRAINT "WaMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPoll" ADD CONSTRAINT "WaPoll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPollOption" ADD CONSTRAINT "WaPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "WaPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPollVote" ADD CONSTRAINT "WaPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "WaPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaPollVote" ADD CONSTRAINT "WaPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
