-- Resume studio (2026-07): saved resume documents + analysis history.
-- Hand-authored (repo convention; shadow-DB replay is broken by pre-existing
-- drift, so `prisma migrate dev` cannot generate this automatically).

-- CreateTable
CREATE TABLE "resume_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'My PMHNP Resume',
    "template" TEXT NOT NULL DEFAULT 'classic',
    "sections" JSONB NOT NULL,
    "content_version" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_id" TEXT,
    "kind" TEXT NOT NULL,
    "job_id" TEXT,
    "input_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_documents_user_id_updated_at_idx" ON "resume_documents"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "resume_analyses_user_id_created_at_idx" ON "resume_analyses"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "resume_analyses_document_id_idx" ON "resume_analyses"("document_id");

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_analyses" ADD CONSTRAINT "resume_analyses_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
