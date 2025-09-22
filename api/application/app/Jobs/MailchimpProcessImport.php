<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use App\Models\MailchimpImportTask;
use App\Models\MailchimpImportLog;

class MailchimpProcessImport implements ShouldQueue
{
    use InteractsWithQueue, Queueable, SerializesModels;

    protected $taskId;

    public function __construct($taskId)
    {
        $this->taskId = $taskId;
    }

    public function handle()
    {
        $task = MailchimpImportTask::find($this->taskId);
        if (!$task) return;

        $task->status = 'processing';
        $task->started_at = now();
        $task->save();

        $path = storage_path('app/' . ltrim($task->storage_path, '/'));
        if (!file_exists($path)) {
            $task->status = 'failed';
            $task->error_message = 'file not found: ' . $path;
            $task->completed_at = now();
            $task->save();
            return;
        }
    $handle = fopen($path, 'r');
            if ($handle === false) {
                $task->status = 'failed';
                $task->error_message = 'unable to open file';
                $task->completed_at = now();
                $task->save();
                return;
            }

            // detect delimiter and header like the controller
            $firstLine = null;
            while (($l = fgets($handle)) !== false) {
                $trim = trim($l);
                if ($trim !== '') { $firstLine = $l; break; }
            }
            if ($firstLine === null) {
                $task->status = 'failed';
                $task->error_message = 'CSV file is empty';
                $task->completed_at = now();
                $task->save();
                return;
            }

            $delims = [',', ';', "\t", '|'];
            $best = ','; $bestCount = -1;
            foreach ($delims as $d) { $c = substr_count($firstLine, $d); if ($c > $bestCount) { $bestCount = $c; $best = $d; } }
            $delimiter = $best;

            rewind($handle);
            $header = null; $count = 0; $now = now(); $skipped = 0; $skippedSamples = [];
            while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
                $allEmpty = true; foreach ($row as $cell) { if (trim($cell) !== '') { $allEmpty = false; break; } }
                if ($allEmpty) continue;

                if (!$header) { $row[0] = preg_replace('/^\xEF\xBB\xBF/', '', $row[0]); $header = array_map('trim', $row); continue; }
                if (count($header) !== count($row)) { $skipped++; if (count($skippedSamples) < 5) $skippedSamples[] = $row; continue; }
                $data = array_combine($header, $row); if (!$data) { $skipped++; if (count($skippedSamples) < 5) $skippedSamples[] = $row; continue; }

                $email = null;
                foreach ($data as $k => $v) { $norm = preg_replace('/[^a-z0-9]/', '', strtolower($k)); if (strpos($norm, 'email') !== false) { $email = trim((string)$v); break; } }
                if (!$email) { $email = $data['email'] ?? ($data['Email'] ?? ($data['email_address'] ?? null)); }
                if (!$email) { $skipped++; if (count($skippedSamples) < 5) $skippedSamples[] = $data; continue; }

                // find other fields flexibly
                $first = null; $last = null; $phone = null; $state = null; $businessName = null; $businessAddress = null; $tags = null;
                foreach ($data as $k => $v) {
                    $kn = preg_replace('/[^a-z0-9]/', '', strtolower($k));
                    $val = trim((string)$v);
                    if (!$first && (strpos($kn, 'fname') !== false || strpos($kn, 'firstname') !== false || strpos($kn, 'first') !== false)) $first = $val;
                    if (!$last && (strpos($kn, 'lname') !== false || strpos($kn, 'lastname') !== false || strpos($kn, 'last') !== false)) $last = $val;
                    if (!$phone && (strpos($kn, 'phone') !== false || strpos($kn, 'mobile') !== false)) $phone = $val;
                    if (!$state && strpos($kn, 'state') !== false) $state = $val;
                    if (!$businessName && (strpos($kn, 'company') !== false || strpos($kn, 'business') !== false || strpos($kn, 'org') !== false)) $businessName = $val;
                    if (!$businessAddress && strpos($kn, 'address') !== false) $businessAddress = $val;
                    if (!$tags && strpos($kn, 'tag') !== false) $tags = $val;
                }

                try {
                    \App\Models\MailchimpContact::updateOrCreate(
                        ['mailchimp_id' => null, 'audience_id' => (string)$task->audience_id, 'email' => $email],
                        ['email' => $email, 'first_name' => $first, 'last_name' => $last, 'phone' => $phone, 'state' => $state, 'business_name' => $businessName, 'business_address' => $businessAddress, 'tags' => $tags, 'raw' => $data, 'synced_at' => $now]
                    );
                    $count++;
                } catch (\Exception $e) {
                    Log::warning('mailchimp async import row failed', ['email' => $email, 'error' => $e->getMessage()]);
                    continue;
                }
            }
        fclose($handle);

        // create import log
        try {
            MailchimpImportLog::create([
                'filename' => $task->filename,
                'audience_id' => (string)$task->audience_id,
                'imported_count' => $count,
                'raw_response' => ['imported' => $count],
            ]);
        } catch (\Exception $e) {
            Log::warning('failed to create mailchimp import log (async)', ['error' => $e->getMessage()]);
        }

        $task->imported_count = $count;
        $task->status = 'completed';
        $task->completed_at = now();
        $task->save();
    }
}
