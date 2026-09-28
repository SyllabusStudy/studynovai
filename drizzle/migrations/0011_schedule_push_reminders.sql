-- lovable-cron-fallback-reviewed: reminder lead times are as short as 1 hour, so deadlines must be checked every 15 minutes to deliver on time; user informed of 96 runs/day and cost
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'studynova-push-reminders';

SELECT cron.schedule(
  'studynova-push-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://studynovai.lovable.app/api/public/push/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '0d92a282f64b42b3ab1bc46b2468a8f6b923cdc5eb014fa3'
    ),
    body := '{}'::jsonb
  );
  $$
);