-- ═══════════════════════════════════════════════════════════════════════════
--  Index and growth audit
--  Run quarterly. MySQL 8 section first, PostgreSQL section below.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
--  MySQL 8
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Largest tables — where the growth actually is
SELECT
    table_name,
    table_rows                                              AS approx_rows,
    ROUND(data_length  / 1024 / 1024, 1)                    AS data_mb,
    ROUND(index_length / 1024 / 1024, 1)                    AS index_mb,
    ROUND((data_length + index_length) / 1024 / 1024, 1)    AS total_mb,
    ROUND(index_length / NULLIF(data_length, 0), 2)         AS index_to_data_ratio
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY (data_length + index_length) DESC
LIMIT 25;
-- index_to_data_ratio > 1 usually means redundant indexes.

-- 2. Tables with NO indexes beyond the primary key
SELECT t.table_name, t.table_rows
FROM information_schema.tables t
LEFT JOIN information_schema.statistics s
       ON s.table_schema = t.table_schema
      AND s.table_name = t.table_name
      AND s.index_name != 'PRIMARY'
WHERE t.table_schema = DATABASE()
  AND t.table_type = 'BASE TABLE'
  AND s.index_name IS NULL
  AND t.table_rows > 10000
ORDER BY t.table_rows DESC;

-- 3. Foreign keys with no index (full scan on every parent delete)
SELECT
    k.table_name,
    k.column_name,
    k.referenced_table_name,
    k.constraint_name
FROM information_schema.key_column_usage k
LEFT JOIN information_schema.statistics s
       ON s.table_schema = k.table_schema
      AND s.table_name = k.table_name
      AND s.column_name = k.column_name
      AND s.seq_in_index = 1
WHERE k.table_schema = DATABASE()
  AND k.referenced_table_name IS NOT NULL
  AND s.index_name IS NULL;

-- 4. Unused indexes — write cost with no read benefit
--    Requires performance_schema enabled and a representative uptime.
SELECT object_schema, object_name, index_name
FROM sys.schema_unused_indexes
WHERE object_schema = DATABASE();
-- Verify across a full business cycle (month-end reports!) before dropping.

-- 5. Redundant indexes — one is a prefix of another
SELECT
    table_name,
    redundant_index_name,
    redundant_index_columns,
    dominant_index_name,
    dominant_index_columns
FROM sys.schema_redundant_indexes
WHERE table_schema = DATABASE();

-- 6. Tables doing full scans
SELECT
    object_schema,
    object_name,
    rows_full_scanned,
    latency
FROM sys.schema_tables_with_full_table_scans
WHERE object_schema = DATABASE()
ORDER BY rows_full_scanned DESC
LIMIT 20;

-- 7. Buffer pool efficiency — the single most important MySQL health number
SELECT
    ROUND(
        (1 - (
            (SELECT variable_value FROM performance_schema.global_status
              WHERE variable_name = 'Innodb_buffer_pool_reads')
            /
            (SELECT variable_value FROM performance_schema.global_status
              WHERE variable_name = 'Innodb_buffer_pool_read_requests')
        )) * 100, 2
    ) AS buffer_pool_hit_rate_pct;
-- Target > 99%. Below that, innodb_buffer_pool_size is too small for the working set.

-- 8. Statement digest — where DB time actually goes
SELECT
    LEFT(digest_text, 120)                       AS query,
    count_star                                   AS executions,
    ROUND(sum_timer_wait / 1e12, 2)              AS total_sec,
    ROUND(avg_timer_wait / 1e9, 2)               AS avg_ms,
    sum_rows_examined / NULLIF(count_star, 0)    AS avg_rows_examined,
    sum_rows_sent     / NULLIF(count_star, 0)    AS avg_rows_sent
FROM performance_schema.events_statements_summary_by_digest
WHERE schema_name = DATABASE()
ORDER BY sum_timer_wait DESC
LIMIT 20;
-- avg_rows_examined >> avg_rows_sent means a missing or wrong index.


-- ═══════════════════════════════════════════════════════════════════════════
--  PostgreSQL
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Largest tables
SELECT
    relname                                          AS table_name,
    n_live_tup                                       AS approx_rows,
    pg_size_pretty(pg_relation_size(relid))          AS data,
    pg_size_pretty(pg_indexes_size(relid))           AS indexes,
    pg_size_pretty(pg_total_relation_size(relid))    AS total
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

-- 2. Sequential scans on large tables — missing indexes
SELECT
    relname,
    seq_scan,
    seq_tup_read,
    idx_scan,
    seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan,
    n_live_tup
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND n_live_tup > 10000
ORDER BY seq_tup_read DESC
LIMIT 20;

-- 3. Unused indexes
SELECT
    schemaname,
    relname                                        AS table_name,
    indexrelname                                   AS index_name,
    idx_scan                                       AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid))   AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelid NOT IN (SELECT conindid FROM pg_constraint)   -- keep constraint indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- 4. Foreign keys with no index
SELECT
    c.conrelid::regclass AS table_name,
    a.attname            AS column_name,
    c.conname            AS constraint_name
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid
 AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND a.attnum = i.indkey[0]
  );

-- 5. Invalid indexes (a failed CREATE INDEX CONCURRENTLY leaves these behind)
SELECT indexrelid::regclass AS invalid_index
FROM pg_index
WHERE NOT indisvalid;

-- 6. Table bloat indicator — dead tuples needing VACUUM
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
    last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY dead_pct DESC;

-- 7. Cache hit rate
SELECT
    ROUND(SUM(heap_blks_hit) * 100.0 / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0), 2)
        AS cache_hit_rate_pct
FROM pg_statio_user_tables;
-- Target > 99%.

-- 8. Slowest statements (requires pg_stat_statements)
SELECT
    LEFT(query, 120)                    AS query,
    calls,
    ROUND(total_exec_time::numeric, 0)  AS total_ms,
    ROUND(mean_exec_time::numeric, 2)   AS mean_ms,
    rows / NULLIF(calls, 0)             AS avg_rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
