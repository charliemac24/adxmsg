This document describes how to enable and populate short unsubscribe redirect links for contacts.

Steps:

1) Run the migration to create the `unsubscribe_redirects` table:

   php artisan migrate

2) Generate short links for existing contacts:

   php application/scripts/generate_unsubscribe_shortlinks.php

   - This script will enumerate contacts, skip ones that already have "/u/" in their `unsubscribe_link`, and for each remaining contact it will create a short token and store the target_url in `unsubscribe_redirects`, then update the contact's `unsubscribe_link` to the short URL of the form:

     https://your-app-url/u/<token>

   - The script reads `app.url` from your Laravel config to build the short URL. Ensure `APP_URL` in your `.env` is set.

3) Verify the redirect works in a browser:

   Visit: https://your-app-url/u/<token>

   - The controller will mark the contact as unsubscribed (set `is_subscribed = 0`) and redirect to the original long unsubscribe URL.

Queue processing (recommended for large contact lists)

1) Ensure queue driver is configured in `.env` (e.g. database, redis). Example for database:

   QUEUE_CONNECTION=database

2) Run the queue worker in a separate terminal:

   php artisan queue:work --tries=3

3) Dispatch the job which will process contacts in chunks:

   php artisan unsubscribe:generate-shortlinks

This will enqueue the job; the queue worker will process and create shortlinks in batches.

If you prefer to run synchronously without a queue worker, you may call the job directly:

   php artisan tinker
   >>> App\Jobs\GenerateUnsubscribeShortlinksJob::dispatchSync();

Notes and caveats:

- The short link tokens are generated using random strings; collisions are re-rolled.
- The redirect controller sets `is_subscribed = 0` on the contact if `contact_id` is present in the redirect record, then redirects to the saved target URL.
- If you prefer, the redirect controller could instead show a confirmation page before unsubscribing; open an issue if you'd like that UX.

Rollback:

- To undo the migration: php artisan migrate:rollback
- The script is idempotent: it skips contacts that already have a short link in `unsubscribe_link`.
