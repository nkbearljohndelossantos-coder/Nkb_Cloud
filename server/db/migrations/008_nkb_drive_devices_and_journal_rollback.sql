-- ============================================================================
-- MIGRATION 008 ROLLBACK: NKB DRIVE DESKTOP WORKSTATIONS & DELTA CHANGE JOURNAL
-- Safe teardown of additive tables and sequences
-- Zero data loss for existing core NKB Cloud tables
-- ============================================================================

DROP TABLE IF EXISTS drive_change_journal CASCADE;
DROP TABLE IF EXISTS nkb_drive_devices CASCADE;
DROP SEQUENCE IF EXISTS drive_change_seq CASCADE;
