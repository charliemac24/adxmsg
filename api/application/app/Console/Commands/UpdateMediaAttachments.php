<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class UpdateMediaAttachments extends Command
{
    protected $signature = 'inbound:update-media 
                           {--batch-size=50 : Number of messages per batch}
                           {--max-batches=10 : Maximum number of batches to process}
                           {--force : Force update messages that already have media_json}
                           {--single : Run single batch instead of multiple batches}
                           {--download : Also download and store media files locally}
                           {--download-only : Only download and store, skip media_json update}
                           {--urls-only : Only update download URLs, skip other steps}';

    protected $description = 'Update media attachments for inbound messages and optionally download files locally';

    public function handle()
    {
        $batchSize = (int) $this->option('batch-size');
        $maxBatches = (int) $this->option('max-batches');
        $force = $this->option('force') ? 'true' : 'false';
        $single = $this->option('single');
        $download = $this->option('download');
        $downloadOnly = $this->option('download-only');
        $urlsOnly = $this->option('urls-only');

        $baseUrl = config('app.url');
        
        // Step 1: Update media_json (unless download-only or urls-only is specified)
        if (!$downloadOnly && !$urlsOnly) {
            $this->info("=== STEP 1: Updating media_json from Twilio ===");
            
            if ($single) {
                $url = "{$baseUrl}/inbound-messages/update-media?limit={$batchSize}&force={$force}";
                $this->info("Running single batch update...");
            } else {
                $url = "{$baseUrl}/inbound-messages/batch-update-media?batch_size={$batchSize}&max_batches={$maxBatches}&force={$force}";
                $this->info("Running batch update...");
            }

            $this->info("URL: {$url}");

            try {
                $response = Http::timeout(300)->get($url);
                
                if ($response->successful()) {
                    $data = $response->json();
                    $this->info("✅ Media JSON update completed!");
                    $this->table(
                        ['Metric', 'Value'],
                        [
                            ['Status', $data['status'] ?? 'N/A'],
                            ['Processed', $data['total_processed'] ?? $data['processed'] ?? 'N/A'],
                            ['Updated', $data['total_updated'] ?? $data['updated'] ?? 'N/A'],
                            ['Errors', $data['total_errors'] ?? $data['errors'] ?? 'N/A'],
                            ['Batches', $data['batches_processed'] ?? '1'],
                        ]
                    );
                } else {
                    $this->error("HTTP Error during media_json update: " . $response->status());
                    $this->error("Response: " . $response->body());
                    
                    if (!$download && !$downloadOnly) {
                        return Command::FAILURE;
                    }
                    
                    $this->warn("Continuing with download step despite media_json update failure...");
                }
            } catch (\Exception $e) {
                $this->error("Failed to update media_json: " . $e->getMessage());
                
                if (!$download && !$downloadOnly) {
                    return Command::FAILURE;
                }
                
                $this->warn("Continuing with download step despite media_json update failure...");
            }
        }

        // Step 2: Download and store locally (if requested)
        if ($download || $downloadOnly) {
            $this->info("=== STEP 2: Downloading and storing media files locally ===");
            
            if ($single) {
                $downloadUrl = "{$baseUrl}/inbound-messages/download-and-store-media?limit={$batchSize}&force={$force}";
                $this->info("Running single batch download...");
            } else {
                $downloadUrl = "{$baseUrl}/inbound-messages/batch-download-and-store-media?batch_size={$batchSize}&max_batches={$maxBatches}&force={$force}";
                $this->info("Running batch download...");
            }

            $this->info("URL: {$downloadUrl}");

            try {
                $this->info("⏳ Downloading media files... This may take a while.");
                
                $downloadResponse = Http::timeout(600)->get($downloadUrl); // Longer timeout for downloads
                
                if ($downloadResponse->successful()) {
                    $downloadData = $downloadResponse->json();
                    $this->info("✅ Media download completed!");
                    $this->table(
                        ['Metric', 'Value'],
                        [
                            ['Status', $downloadData['status'] ?? 'N/A'],
                            ['Processed', $downloadData['total_processed'] ?? $downloadData['processed'] ?? 'N/A'],
                            ['Downloaded', $downloadData['total_downloaded'] ?? $downloadData['downloaded'] ?? 'N/A'],
                            ['Errors', $downloadData['total_errors'] ?? $downloadData['errors'] ?? 'N/A'],
                            ['Batches', $downloadData['batches_processed'] ?? '1'],
                        ]
                    );
                } else {
                    $this->error("HTTP Error during media download: " . $downloadResponse->status());
                    $this->error("Response: " . $downloadResponse->body());
                    return Command::FAILURE;
                }
            } catch (\Exception $e) {
                $this->error("Failed to download and store media: " . $e->getMessage());
                return Command::FAILURE;
            }
        }

        // Step 3: Update download URLs (if requested or after download)
        if ($download || $downloadOnly || $urlsOnly) {
            $this->info("=== STEP 3: Updating download URLs ===");
            
            if ($single) {
                $urlsUrl = "{$baseUrl}/inbound-messages/update-download-urls?limit={$batchSize}&force={$force}";
                $this->info("Running single batch URL update...");
            } else {
                $urlsUrl = "{$baseUrl}/inbound-messages/batch-update-download-urls?batch_size={$batchSize}&max_batches={$maxBatches}&force={$force}";
                $this->info("Running batch URL update...");
            }

            $this->info("URL: {$urlsUrl}");

            try {
                $urlsResponse = Http::timeout(300)->get($urlsUrl);
                
                if ($urlsResponse->successful()) {
                    $urlsData = $urlsResponse->json();
                    $this->info("✅ Download URLs update completed!");
                    $this->table(
                        ['Metric', 'Value'],
                        [
                            ['Status', $urlsData['status'] ?? 'N/A'],
                            ['Processed', $urlsData['total_processed'] ?? $urlsData['processed'] ?? 'N/A'],
                            ['Updated', $urlsData['total_updated'] ?? $urlsData['updated'] ?? 'N/A'],
                            ['Errors', $urlsData['total_errors'] ?? $urlsData['errors'] ?? 'N/A'],
                            ['Batches', $urlsData['batches_processed'] ?? '1'],
                        ]
                    );
                } else {
                    $this->error("HTTP Error during download URLs update: " . $urlsResponse->status());
                    $this->error("Response: " . $urlsResponse->body());
                    return Command::FAILURE;
                }
            } catch (\Exception $e) {
                $this->error("Failed to update download URLs: " . $e->getMessage());
                return Command::FAILURE;
            }
        }

        // Summary
        $this->info("=== SUMMARY ===");
        if (!$downloadOnly && !$urlsOnly) {
            $this->info("✅ Media JSON update: Completed");
        }
        if (($download || $downloadOnly) && !$urlsOnly) {
            $this->info("✅ Media download: Completed");
        }
        if ($download || $downloadOnly || $urlsOnly) {
            $this->info("✅ Download URLs update: Completed");
        }
        
        $this->info("🎉 All operations completed successfully!");
        
        return Command::SUCCESS;
    }
}