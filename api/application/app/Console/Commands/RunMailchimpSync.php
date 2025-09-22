<?php
namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Http\Controllers\MailchimpController;

class RunMailchimpSync extends Command
{
    protected $signature = 'mailchimp:run-sync {audienceId}';
    protected $description = 'Run Mailchimp sync for an audience and print JSON result';

    public function handle()
    {
        $aud = $this->argument('audienceId');
        $ctrl = new MailchimpController();
        $res = $ctrl->syncAudience(request(), $aud);
        $this->line($res->getContent());
        return 0;
    }
}
