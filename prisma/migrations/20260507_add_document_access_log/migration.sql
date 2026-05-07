-- Audit log for resume (and future PII document) reads.
-- See lib/resume-storage.ts for the write path and prisma/schema.prisma
-- model DocumentAccessLog for the column-level docs.

CREATE TABLE "document_access_log" (
    "id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_log_pkey" PRIMARY KEY ("id")
);

-- Owner-side query: "show me everyone who viewed my resume" — newest first.
CREATE INDEX "document_access_log_owner_id_created_at_idx"
    ON "document_access_log"("owner_id", "created_at");

-- Actor-side query: anomaly detection (one employer pulling many resumes
-- in a short window) and SOC2 evidence per requester.
CREATE INDEX "document_access_log_actor_id_created_at_idx"
    ON "document_access_log"("actor_id", "created_at");

-- Doc-type partition: when we add cover letters / transcripts, scoping
-- queries to a single doc_type stays cheap.
CREATE INDEX "document_access_log_doc_type_created_at_idx"
    ON "document_access_log"("doc_type", "created_at");
