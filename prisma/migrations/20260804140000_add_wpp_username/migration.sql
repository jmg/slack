-- AlterTable
ALTER TABLE "WaUser" ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WaUser_username_key" ON "WaUser"("username");
