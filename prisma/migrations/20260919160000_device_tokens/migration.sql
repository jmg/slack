-- Phones running the Android app, so a message can reach someone who is not
-- looking at a tab.
--
-- Web Push cannot serve them: the app is a WebView over the live site and a
-- WebView has no Push API, so the browser channel simply never fires there.
-- The app registers an FCM token instead and push.ts fans out to both.
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- The token identifies the phone, not the person: signing in with another
-- account on the same device reassigns the row rather than adding a second one,
-- which would send that phone both accounts' notifications.
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- The send path looks up every phone of a recipient.
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
