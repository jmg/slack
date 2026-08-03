-- CreateEnum
CREATE TYPE "WaChatType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "WaMemberRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WaMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WaVisibility" AS ENUM ('EVERYONE', 'CONTACTS', 'NOBODY');

-- CreateEnum
CREATE TYPE "WaStatusKind" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "WaAttachmentPurpose" AS ENUM ('MESSAGE', 'AVATAR', 'GROUP_ICON', 'STATUS');

-- CreateTable
CREATE TABLE "WaUser" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT 'Hey there! I am using Talkaroo.',
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "wallpaper" TEXT NOT NULL DEFAULT 'default',
    "lastSeenAt" TIMESTAMP(3),
    "lastSeenPrivacy" "WaVisibility" NOT NULL DEFAULT 'EVERYONE',
    "avatarPrivacy" "WaVisibility" NOT NULL DEFAULT 'EVERYONE',
    "aboutPrivacy" "WaVisibility" NOT NULL DEFAULT 'EVERYONE',
    "readReceipts" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaChat" (
    "id" TEXT NOT NULL,
    "type" "WaChatType" NOT NULL,
    "subject" TEXT,
    "description" TEXT,
    "iconUrl" TEXT,
    "directKey" TEXT,
    "createdById" TEXT,
    "inviteToken" TEXT,
    "onlyAdminsCanSend" BOOLEAN NOT NULL DEFAULT false,
    "onlyAdminsCanEditInfo" BOOLEAN NOT NULL DEFAULT true,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaChatMember" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WaMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDeliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "draft" TEXT,

    CONSTRAINT "WaChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "senderId" TEXT,
    "kind" "WaMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "replyToId" TEXT,
    "forwardScore" INTEGER NOT NULL DEFAULT 0,
    "systemAction" TEXT,
    "systemMeta" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessageStar" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessageStar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessageHide" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessageHide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaAttachment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "waveform" TEXT,
    "purpose" "WaAttachmentPurpose" NOT NULL DEFAULT 'MESSAGE',
    "messageId" TEXT,
    "chatId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaContact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "alias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaStatus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WaStatusKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL DEFAULT '',
    "backgroundColor" TEXT,
    "attachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaStatusView" (
    "id" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaStatusView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaUser_phone_key" ON "WaUser"("phone");

-- CreateIndex
CREATE INDEX "WaUser_lastSeenAt_idx" ON "WaUser"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaChat_directKey_key" ON "WaChat"("directKey");

-- CreateIndex
CREATE UNIQUE INDEX "WaChat_inviteToken_key" ON "WaChat"("inviteToken");

-- CreateIndex
CREATE INDEX "WaChat_lastMessageAt_idx" ON "WaChat"("lastMessageAt");

-- CreateIndex
CREATE INDEX "WaChat_createdById_idx" ON "WaChat"("createdById");

-- CreateIndex
CREATE INDEX "WaChatMember_userId_archivedAt_idx" ON "WaChatMember"("userId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaChatMember_chatId_userId_key" ON "WaChatMember"("chatId", "userId");

-- CreateIndex
CREATE INDEX "WaMessage_chatId_createdAt_idx" ON "WaMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "WaMessage_senderId_idx" ON "WaMessage"("senderId");

-- CreateIndex
CREATE INDEX "WaMessage_replyToId_idx" ON "WaMessage"("replyToId");

-- CreateIndex
CREATE INDEX "WaReaction_userId_idx" ON "WaReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaReaction_messageId_userId_key" ON "WaReaction"("messageId", "userId");

-- CreateIndex
CREATE INDEX "WaMessageStar_userId_createdAt_idx" ON "WaMessageStar"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessageStar_messageId_userId_key" ON "WaMessageStar"("messageId", "userId");

-- CreateIndex
CREATE INDEX "WaMessageHide_userId_idx" ON "WaMessageHide"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessageHide_messageId_userId_key" ON "WaMessageHide"("messageId", "userId");

-- CreateIndex
CREATE INDEX "WaAttachment_messageId_idx" ON "WaAttachment"("messageId");

-- CreateIndex
CREATE INDEX "WaAttachment_uploaderId_messageId_idx" ON "WaAttachment"("uploaderId", "messageId");

-- CreateIndex
CREATE INDEX "WaAttachment_chatId_idx" ON "WaAttachment"("chatId");

-- CreateIndex
CREATE INDEX "WaAttachment_key_idx" ON "WaAttachment"("key");

-- CreateIndex
CREATE INDEX "WaContact_contactId_idx" ON "WaContact"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_ownerId_contactId_key" ON "WaContact"("ownerId", "contactId");

-- CreateIndex
CREATE INDEX "WaBlock_blockedId_idx" ON "WaBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "WaBlock_blockerId_blockedId_key" ON "WaBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "WaStatus_attachmentId_key" ON "WaStatus"("attachmentId");

-- CreateIndex
CREATE INDEX "WaStatus_userId_createdAt_idx" ON "WaStatus"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WaStatus_expiresAt_idx" ON "WaStatus"("expiresAt");

-- CreateIndex
CREATE INDEX "WaStatusView_viewerId_idx" ON "WaStatusView"("viewerId");

-- CreateIndex
CREATE UNIQUE INDEX "WaStatusView_statusId_viewerId_key" ON "WaStatusView"("statusId", "viewerId");

-- AddForeignKey
ALTER TABLE "WaChat" ADD CONSTRAINT "WaChat_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "WaUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaChatMember" ADD CONSTRAINT "WaChatMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WaChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaChatMember" ADD CONSTRAINT "WaChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WaChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "WaUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "WaMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaReaction" ADD CONSTRAINT "WaReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaReaction" ADD CONSTRAINT "WaReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageStar" ADD CONSTRAINT "WaMessageStar_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageStar" ADD CONSTRAINT "WaMessageStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageHide" ADD CONSTRAINT "WaMessageHide_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessageHide" ADD CONSTRAINT "WaMessageHide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaAttachment" ADD CONSTRAINT "WaAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaAttachment" ADD CONSTRAINT "WaAttachment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "WaChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaAttachment" ADD CONSTRAINT "WaAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBlock" ADD CONSTRAINT "WaBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaBlock" ADD CONSTRAINT "WaBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaStatus" ADD CONSTRAINT "WaStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaStatus" ADD CONSTRAINT "WaStatus_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "WaAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaStatusView" ADD CONSTRAINT "WaStatusView_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "WaStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaStatusView" ADD CONSTRAINT "WaStatusView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "WaUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
