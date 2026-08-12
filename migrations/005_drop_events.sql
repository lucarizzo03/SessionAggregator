-- The webhook route this table backed is gone (app/api/webhook removed):
-- every event type it would have delivered live also gets replayed inside
-- the pull response's own events array (see lib/tavus.ts,
-- extractConversationDetail), and callback_url was never actually set on
-- any real call, so this table has been 0 rows since day one. 001_init.sql
-- no longer creates it either, so this only matters for databases that
-- already ran the old 001.
drop table if exists events;
