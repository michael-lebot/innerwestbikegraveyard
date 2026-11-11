-- CreateEnum
CREATE TYPE "tag_status" AS ENUM ('active', 'removed', 'taken_down');

-- CreateEnum
CREATE TYPE "problem" AS ENUM ('blocking_footpath', 'knocked_over', 'blocking_ramp', 'in_waterway', 'in_park', 'damaged');

-- CreateEnum
CREATE TYPE "tag_event_type" AS ENUM ('created', 'still_there', 'removed', 'restored', 'taken_down');

-- CreateEnum
CREATE TYPE "photo_status" AS ENUM ('visible', 'hidden', 'deleted');

-- CreateEnum
CREATE TYPE "report_reason" AS ENUM ('not_share_bike', 'privacy', 'offensive', 'other');

-- CreateEnum
CREATE TYPE "report_resolution" AS ENUM ('restored', 'deleted', 'expired');

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "suburb" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "problem" "problem" NOT NULL,
    "status" "tag_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_confirmed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "removed_at" TIMESTAMPTZ,
    "confirm_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tag_id" UUID NOT NULL,
    "type" "tag_event_type" NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" UUID NOT NULL,
    "visitor_hash" TEXT,
    "ip_hash" TEXT,

    CONSTRAINT "tag_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tag_id" UUID NOT NULL,
    "blob_path" TEXT NOT NULL,
    "thumb_path" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "status" "photo_status" NOT NULL DEFAULT 'visible',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "photo_id" UUID NOT NULL,
    "reason" "report_reason" NOT NULL,
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitor_hash" TEXT,
    "ip_hash" TEXT,
    "notified_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "resolution" "report_resolution",

    CONSTRAINT "photo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_counters" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_counters_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "daily_salts" (
    "day" DATE NOT NULL,
    "salt" TEXT NOT NULL,

    CONSTRAINT "daily_salts_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "site_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "uploads_paused_at" TIMESTAMPTZ,
    "uploads_paused_reason" TEXT,

    CONSTRAINT "site_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_status_expires_at_idx" ON "tags"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tag_events_request_id_key" ON "tag_events"("request_id");

-- CreateIndex
CREATE INDEX "tag_events_tag_id_idx" ON "tag_events"("tag_id");

-- CreateIndex
CREATE INDEX "tag_events_at_idx" ON "tag_events"("at");

-- CreateIndex
CREATE UNIQUE INDEX "photos_tag_id_key" ON "photos"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_reports_request_id_key" ON "photo_reports"("request_id");

-- CreateIndex
CREATE INDEX "photo_reports_photo_id_idx" ON "photo_reports"("photo_id");

-- CreateIndex
CREATE INDEX "photo_reports_created_at_idx" ON "photo_reports"("created_at");

-- AddForeignKey
ALTER TABLE "tag_events" ADD CONSTRAINT "tag_events_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- site_state holds exactly one row (written by hand: Prisma can't express a CHECK constraint)
ALTER TABLE "site_state" ADD CONSTRAINT "site_state_one_row" CHECK ("id" = 1);
INSERT INTO "site_state" ("id") VALUES (1);
