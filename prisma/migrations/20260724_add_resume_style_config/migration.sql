-- Resume studio redesign (2026-07-24): per-document presentation options
-- (font, density, paper size) shared by the live preview and the PDF export.
-- Nullable so existing documents fall back to their template defaults.
ALTER TABLE "resume_documents" ADD COLUMN "style_config" JSONB;
