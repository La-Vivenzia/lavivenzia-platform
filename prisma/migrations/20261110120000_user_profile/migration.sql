-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "preferences" JSONB DEFAULT '{}';
