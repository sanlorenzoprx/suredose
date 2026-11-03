-- Additive upgrade, separate from PostgreSQL migration tracking.
-- Existing deployments require a schema preflight before applying this file.
alter table care_medicines add column timezone text;
alter table care_medicines add column schedule_started_at text;
update care_medicines set schedule_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where schedule_started_at is null;
alter table dose_events add column notification_claim text;
alter table dose_events add column notification_claim_until text;
create trigger care_medicines_schedule_start after insert on care_medicines
when new.schedule_started_at is null
begin
  update care_medicines set schedule_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  where household_id = new.household_id and id = new.id;
end;
