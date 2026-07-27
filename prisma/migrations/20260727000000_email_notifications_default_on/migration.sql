-- Missed-message email notifications should work out of the box: the notify
-- cron already runs every 5 minutes, but the pref shipped defaulting to false,
-- so it never fired for anyone. Make it opt-out (like Slack, which emails you
-- about activity you missed while away) and enable it for existing users who
-- never made a deliberate choice. Anyone can turn it off in Settings.
ALTER TABLE "User" ALTER COLUMN "emailNotifications" SET DEFAULT true;
UPDATE "User" SET "emailNotifications" = true WHERE "emailNotifications" = false;
