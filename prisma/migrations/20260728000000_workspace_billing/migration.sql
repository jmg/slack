-- Per-workspace Stripe billing. A workspace subscribes to the "team" plan;
-- quantity = seats (member count). The webhook keeps these in sync.
ALTER TABLE "Workspace" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "Workspace" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
CREATE UNIQUE INDEX "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");
CREATE UNIQUE INDEX "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");
