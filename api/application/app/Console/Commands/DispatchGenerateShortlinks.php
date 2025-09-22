<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Jobs\GenerateUnsubscribeShortlinksJob;

class DispatchGenerateShortlinks extends Command
{
    protected $signature = 'unsubscribe:generate-shortlinks';
    protected $description = 'Dispatch job to generate unsubscribe shortlinks for contacts';

    public function handle()
    {
        $this->info('Dispatching GenerateUnsubscribeShortlinksJob to queue...');
        GenerateUnsubscribeShortlinksJob::dispatch();
        $this->info('Job dispatched. Run your queue worker to process it.');
        return 0;
    }
}
