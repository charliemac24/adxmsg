Before running the migration that adds a unique index on `twilio_sid` you must ensure there are no duplicate non-null twilio_sid values in `inbound_messages`.

Recommended SQL to inspect duplicates (run in your database client):

-- find duplicates
SELECT twilio_sid, COUNT(*) as cnt
FROM inbound_messages
WHERE twilio_sid IS NOT NULL AND twilio_sid <> ''
GROUP BY twilio_sid
HAVING COUNT(*) > 1;

If the above returns rows, here's a safe way to keep the latest record and delete older duplicates (adjust `created_at`/`id` criteria as needed):

-- keep the newest per twilio_sid, delete older ones
WITH to_keep AS (
  SELECT id
  FROM (
    SELECT id, twilio_sid, ROW_NUMBER() OVER (PARTITION BY twilio_sid ORDER BY COALESCE(received_at, created_at) DESC, id DESC) rn
    FROM inbound_messages
    WHERE twilio_sid IS NOT NULL AND twilio_sid <> ''
  ) t
  WHERE rn = 1
)
DELETE FROM inbound_messages
WHERE twilio_sid IS NOT NULL AND twilio_sid <> '' AND id NOT IN (SELECT id FROM to_keep);

Note: Test the above on a copy of the DB first. Alternatively export the duplicates and review before deleting.

After deduplication, run:

php artisan migrate

If you prefer, I can create a small artisan command or migration script that safely deduplicates by moving duplicates to an archive table instead of deleting them. Let me know which approach you prefer.
