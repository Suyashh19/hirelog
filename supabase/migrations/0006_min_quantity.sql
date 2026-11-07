-- Minimum billed quantity for count units: "minimum 250 km a day", "minimum 2 days", "minimum 1 acre".
alter table rates add column if not exists min_quantity numeric;
