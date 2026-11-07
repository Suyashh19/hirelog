-- Pro plan allows 5 resources (was 3). Limits live in a table so no app update is needed.
update plan_limits set resources = 5 where plan = 'pro';
