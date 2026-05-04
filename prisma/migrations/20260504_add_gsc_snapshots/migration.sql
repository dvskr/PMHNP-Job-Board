-- P4.2: daily GSC Coverage snapshots so we can compare week-over-week and
-- alert on regressions (rising not-indexed count, falling indexed count).
-- Populated by /api/cron/gsc-health-check via the Search Console API.
--
-- Forward-only, additive.

CREATE TABLE IF NOT EXISTS "gsc_snapshots" (
    "id"                       TEXT PRIMARY KEY,
    "captured_on"              DATE NOT NULL UNIQUE,
    "indexed_total"            INTEGER NOT NULL DEFAULT 0,
    "not_indexed_total"        INTEGER NOT NULL DEFAULT 0,
    "not_found_404"            INTEGER NOT NULL DEFAULT 0,
    "server_error_5xx"         INTEGER NOT NULL DEFAULT 0,
    "soft_404"                 INTEGER NOT NULL DEFAULT 0,
    "crawled_not_indexed"      INTEGER NOT NULL DEFAULT 0,
    "discovered_not_indexed"   INTEGER NOT NULL DEFAULT 0,
    "duplicate_no_canonical"   INTEGER NOT NULL DEFAULT 0,
    "excluded_noindex"         INTEGER NOT NULL DEFAULT 0,
    "page_with_redirect"       INTEGER NOT NULL DEFAULT 0,
    "blocked_by_robots"        INTEGER NOT NULL DEFAULT 0,
    "indexed_but_blocked"      INTEGER NOT NULL DEFAULT 0,
    "raw"                      JSONB,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
