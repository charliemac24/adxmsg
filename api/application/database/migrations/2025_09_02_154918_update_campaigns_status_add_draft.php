<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class UpdateCampaignsStatusAddDraft extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds "Draft" to the campaigns.status enum (MySQL) or converts status to string for other drivers.
     *
     * @return void
     */
    public function up()
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            // Read existing enum values
            $row = DB::selectOne("
                SELECT COLUMN_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'campaigns'
                  AND COLUMN_NAME = 'status'
            ");

            if ($row && preg_match("/^enum\\((.*)\\)$/i", $row->COLUMN_TYPE, $m)) {
                $raw = $m[1];
                // parse values like 'Scheduled','Sent'
                $parts = array_map(function($v) {
                    return trim($v, " '\"");
                }, explode(',', $raw));

                if (!in_array('Draft', $parts, true)) {
                    $parts[] = 'Draft';
                    // keep current default if present, otherwise default to 'Scheduled'
                    $default = in_array('Scheduled', $parts, true) ? 'Scheduled' : $parts[0];
                    $vals = implode("','", array_map(function($v){ return str_replace("'", "''", $v); }, $parts));
                    $sql = "ALTER TABLE `campaigns` MODIFY `status` ENUM('{$vals}') NOT NULL DEFAULT '{$default}'";
                    DB::statement($sql);
                }
            } else {
                // If column is not enum, try to change to enum with Draft and common statuses
                DB::statement("ALTER TABLE `campaigns` MODIFY `status` ENUM('Draft','Scheduled','Sent') NOT NULL DEFAULT 'Scheduled'");
            }
        } else {
            // For non-MySQL drivers: change to string to accept 'Draft' (requires doctrine/dbal for change())
            Schema::table('campaigns', function (Blueprint $table) {
                $table->string('status', 50)->default('Scheduled')->change();
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * Removes "Draft" from the enum (MySQL) or does nothing for other drivers.
     *
     * @return void
     */
    public function down()
    {
        $driver = DB::getDriverName();

        if ($driver === 'mysql') {
            $row = DB::selectOne("
                SELECT COLUMN_TYPE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'campaigns'
                  AND COLUMN_NAME = 'status'
            ");

            if ($row && preg_match("/^enum\\((.*)\\)$/i", $row->COLUMN_TYPE, $m)) {
                $raw = $m[1];
                $parts = array_map(function($v) {
                    return trim($v, " '\"");
                }, explode(',', $raw));

                if (in_array('Draft', $parts, true)) {
                    $parts = array_values(array_filter($parts, function($v){ return $v !== 'Draft'; }));
                    if (empty($parts)) {
                        $parts = ['Scheduled','Sent'];
                    }
                    $default = in_array('Scheduled', $parts, true) ? 'Scheduled' : $parts[0];
                    $vals = implode("','", array_map(function($v){ return str_replace("'", "''", $v); }, $parts));
                    $sql = "ALTER TABLE `campaigns` MODIFY `status` ENUM('{$vals}') NOT NULL DEFAULT '{$default}'";
                    DB::statement($sql);
                }
            }
        } else {
            // No safe automatic revert for other drivers
            // Optionally change back if you know previous type
        }
    }
}
