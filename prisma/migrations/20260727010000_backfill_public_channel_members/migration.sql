-- Posting now requires channel membership. Before this change, any workspace
-- member could post in a public channel without a ChannelMember row. Grandfather
-- that implicit access into explicit membership so existing users don't suddenly
-- face a "Join channel" wall on channels they were already using. Idempotent.
INSERT INTO "ChannelMember" ("id", "channelId", "userId", "createdAt")
SELECT md5(c."id" || '-' || wm."userId"), c."id", wm."userId", NOW()
FROM "Channel" c
JOIN "WorkspaceMember" wm ON wm."workspaceId" = c."workspaceId"
WHERE c."isPrivate" = false
ON CONFLICT ("channelId", "userId") DO NOTHING;
