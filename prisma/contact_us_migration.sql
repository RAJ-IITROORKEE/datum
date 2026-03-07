-- ============================================================
--  Datum — contact_us table migration
--  Run this in Supabase SQL Editor (one-time)
--  https://supabase.com/dashboard/project/ggtczevmokoncoqbldct/sql
-- ============================================================

-- 1. Create enums (skip if they already exist)
DO $$ BEGIN
  CREATE TYPE "ContactStatus" AS ENUM ('PENDING', 'RESOLVED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationType" AS ENUM ('NEW_INQUIRY', 'ADMIN_REPLY', 'USER_REPLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Rename fullName → name (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contact_us' AND column_name = 'fullName'
  ) THEN
    ALTER TABLE "contact_us" RENAME COLUMN "fullName" TO "name";
  END IF;
END $$;

-- 3. Change message to TEXT (safe, idempotent)
ALTER TABLE "contact_us" ALTER COLUMN "message" TYPE TEXT;

-- 4. Add new columns (skip if they already exist)
ALTER TABLE "contact_us"
  ADD COLUMN IF NOT EXISTS "status"            "ContactStatus"    NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "threadId"          TEXT,
  ADD COLUMN IF NOT EXISTS "parentId"          TEXT,
  ADD COLUMN IF NOT EXISTS "conversationType"  "ConversationType" NOT NULL DEFAULT 'NEW_INQUIRY',
  ADD COLUMN IF NOT EXISTS "dailyMessageCount" INTEGER            NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastMessageDate"   TIMESTAMP(3);

-- 5. Self-referential FK (skip if already exists)
DO $$ BEGIN
  ALTER TABLE "contact_us"
    ADD CONSTRAINT "contact_us_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "contact_us"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Indexes (skip if already exist)
CREATE INDEX IF NOT EXISTS "contact_us_threadId_idx" ON "contact_us"("threadId");
CREATE INDEX IF NOT EXISTS "contact_us_email_idx"    ON "contact_us"("email");
