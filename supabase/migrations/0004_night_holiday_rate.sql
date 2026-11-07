-- RS-5 night/holiday rate.
-- Night: per-hour price inside a daily window (minutes since midnight; from > to wraps past midnight).
-- Holiday: per-hour price on the business's holidays, which are set once per workspace.
alter table rates add column if not exists night_from_min int;
alter table rates add column if not exists night_to_min int;
alter table rates add column if not exists night_amount_paise bigint;
alter table rates add column if not exists holiday_amount_paise bigint;

-- "0,6" = Sundays and Saturdays (0 = Sunday). Dates: "01-26" every year, or "2027-03-14" one day.
alter table workspaces add column if not exists holiday_weekdays text;
alter table workspaces add column if not exists holiday_dates text;
