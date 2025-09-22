<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * The Artisan commands provided by your application.
     *
     * @var array
     */
    protected $commands = [
        \App\Console\Commands\DispatchGenerateShortlinks::class,
        \App\Console\Commands\InboundSync::class,
    \App\Console\Commands\OutboundSync::class,
        \App\Console\Commands\SendScheduledCampaigns::class,
    \App\Console\Commands\MigrateToInbox::class,
    \App\Console\Commands\ResetInboxReadFlags::class,
    ];

    /**
     * Define the application's command schedule.
     *
     * @param  \Illuminate\Console\Scheduling\Schedule  $schedule
     * @return void
     */
    protected function schedule(Schedule $schedule)
    {
        // Run the scheduled campaigns sender every minute
        $schedule->command('campaigns:send-scheduled')->everyMinute();
    }

    /**
     * Register the commands for the application.
     *
     * @return void
     */
    protected function commands()
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
