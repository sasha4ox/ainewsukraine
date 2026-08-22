-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('RSS', 'WEB');

-- CreateEnum
CREATE TYPE "TelegramSourceKind" AS ENUM ('public_channel', 'private_channel', 'official');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('confirmed', 'mostly_confirmed', 'unconfirmed', 'contradicted');

-- CreateEnum
CREATE TYPE "EventSourceRole" AS ENUM ('primary', 'independent', 'copy', 'official', 'citation');

-- CreateEnum
CREATE TYPE "SourceRelationType" AS ENUM ('copy', 'citation');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('pending', 'generated', 'published', 'failed');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceKind" NOT NULL DEFAULT 'RSS',
    "url" TEXT NOT NULL,
    "country" TEXT,
    "language" TEXT,
    "organization" TEXT,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "reliability_score" INTEGER NOT NULL DEFAULT 50,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "invite_link" TEXT,
    "source_type" "TelegramSourceKind" NOT NULL,
    "organization" TEXT,
    "official_source_id" TEXT,
    "reliability_score" INTEGER NOT NULL DEFAULT 40,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_processed_message_id" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_sources" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT,
    "telegram_url" TEXT,
    "facebook_url" TEXT,
    "x_url" TEXT,
    "country" TEXT NOT NULL DEFAULT 'UA',
    "reliability_score" INTEGER NOT NULL DEFAULT 90,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_uk" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "source_id" TEXT,
    "telegram_source_id" TEXT,
    "source_type" TEXT NOT NULL,
    "url" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "language" TEXT,
    "external_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_messages" (
    "id" TEXT NOT NULL,
    "telegram_source_id" TEXT NOT NULL,
    "message_id" INTEGER NOT NULL,
    "text" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "media_type" TEXT,
    "media_metadata" JSONB,
    "raw_news_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_summary" TEXT,
    "event_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "importance_score" INTEGER NOT NULL DEFAULT 0,
    "credibility_score" INTEGER NOT NULL DEFAULT 0,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unconfirmed',
    "primary_source_url" TEXT,
    "digest_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_categories" (
    "event_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("event_id","category_id")
);

-- CreateTable
CREATE TABLE "event_sources" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "raw_news_id" TEXT NOT NULL,
    "role" "EventSourceRole" NOT NULL DEFAULT 'independent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_relationships" (
    "id" TEXT NOT NULL,
    "from_news_id" TEXT NOT NULL,
    "to_news_id" TEXT NOT NULL,
    "type" "SourceRelationType" NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_digests" (
    "id" TEXT NOT NULL,
    "digest_date" DATE NOT NULL,
    "digest_type" TEXT NOT NULL DEFAULT 'daily_top',
    "status" "DigestStatus" NOT NULL DEFAULT 'pending',
    "timezone" TEXT NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_items" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_posts" (
    "id" TEXT NOT NULL,
    "digest_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "message_id" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_enabled_idx" ON "sources"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE INDEX "telegram_sources_enabled_idx" ON "telegram_sources"("enabled");

-- CreateIndex
CREATE INDEX "telegram_sources_username_idx" ON "telegram_sources"("username");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "raw_news_content_hash_key" ON "raw_news"("content_hash");

-- CreateIndex
CREATE INDEX "raw_news_url_idx" ON "raw_news"("url");

-- CreateIndex
CREATE INDEX "raw_news_content_hash_idx" ON "raw_news"("content_hash");

-- CreateIndex
CREATE INDEX "raw_news_body_hash_idx" ON "raw_news"("body_hash");

-- CreateIndex
CREATE INDEX "raw_news_published_at_idx" ON "raw_news"("published_at");

-- CreateIndex
CREATE INDEX "raw_news_created_at_idx" ON "raw_news"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_news_source_id_external_id_key" ON "raw_news"("source_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "raw_news_telegram_source_id_external_id_key" ON "raw_news"("telegram_source_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_messages_raw_news_id_key" ON "telegram_messages"("raw_news_id");

-- CreateIndex
CREATE INDEX "telegram_messages_telegram_source_id_message_id_idx" ON "telegram_messages"("telegram_source_id", "message_id");

-- CreateIndex
CREATE INDEX "telegram_messages_date_idx" ON "telegram_messages"("date");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_messages_telegram_source_id_message_id_key" ON "telegram_messages"("telegram_source_id", "message_id");

-- CreateIndex
CREATE INDEX "events_event_time_idx" ON "events"("event_time");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE INDEX "events_digest_date_idx" ON "events"("digest_date");

-- CreateIndex
CREATE INDEX "events_credibility_score_idx" ON "events"("credibility_score");

-- CreateIndex
CREATE INDEX "events_importance_score_idx" ON "events"("importance_score");

-- CreateIndex
CREATE INDEX "event_sources_raw_news_id_idx" ON "event_sources"("raw_news_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_sources_event_id_raw_news_id_key" ON "event_sources"("event_id", "raw_news_id");

-- CreateIndex
CREATE INDEX "source_relationships_to_news_id_idx" ON "source_relationships"("to_news_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_relationships_from_news_id_to_news_id_type_key" ON "source_relationships"("from_news_id", "to_news_id", "type");

-- CreateIndex
CREATE INDEX "ai_analyses_event_id_kind_idx" ON "ai_analyses"("event_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "daily_digests_digest_date_digest_type_key" ON "daily_digests"("digest_date", "digest_type");

-- CreateIndex
CREATE UNIQUE INDEX "digest_items_digest_id_rank_key" ON "digest_items"("digest_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "digest_items_digest_id_event_id_key" ON "digest_items"("digest_id", "event_id");

-- CreateIndex
CREATE INDEX "telegram_posts_digest_id_idx" ON "telegram_posts"("digest_id");

-- AddForeignKey
ALTER TABLE "telegram_sources" ADD CONSTRAINT "telegram_sources_official_source_id_fkey" FOREIGN KEY ("official_source_id") REFERENCES "official_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_news" ADD CONSTRAINT "raw_news_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_news" ADD CONSTRAINT "raw_news_telegram_source_id_fkey" FOREIGN KEY ("telegram_source_id") REFERENCES "telegram_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_telegram_source_id_fkey" FOREIGN KEY ("telegram_source_id") REFERENCES "telegram_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_raw_news_id_fkey" FOREIGN KEY ("raw_news_id") REFERENCES "raw_news"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_raw_news_id_fkey" FOREIGN KEY ("raw_news_id") REFERENCES "raw_news"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_relationships" ADD CONSTRAINT "source_relationships_from_news_id_fkey" FOREIGN KEY ("from_news_id") REFERENCES "raw_news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_relationships" ADD CONSTRAINT "source_relationships_to_news_id_fkey" FOREIGN KEY ("to_news_id") REFERENCES "raw_news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "daily_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_items" ADD CONSTRAINT "digest_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_posts" ADD CONSTRAINT "telegram_posts_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "daily_digests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

