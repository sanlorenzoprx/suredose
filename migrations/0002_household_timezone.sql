-- Each household's IANA timezone (for example "America/New_York"), sent by the
-- patient's phone. The missed-dose cron runs on a server clock in UTC, so it
-- needs this to know when "15:29" on the patient's phone actually happened.
-- NULL means "not reported yet" (a household created before this migration):
-- the cron skips it until the patient's phone next syncs, rather than guessing.
alter table households add column timezone text;
