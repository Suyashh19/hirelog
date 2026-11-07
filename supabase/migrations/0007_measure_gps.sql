-- How each price is measured, and the km the phone's GPS counted on a trip (kept as proof).
alter table rates add column if not exists measure text
  check (measure is null or measure in ('timer','gps','odometer','hourmeter','count'));
alter table time_entries add column if not exists gps_km numeric;
