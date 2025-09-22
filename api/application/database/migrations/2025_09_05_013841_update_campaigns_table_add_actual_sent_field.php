<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('campaigns', function (Blueprint $table) {
            // nullable timestamp to record when the campaign was actually sent
            $table->timestamp('actual_sent')->nullable()->after('sent_at')->index();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('campaigns', function (Blueprint $table) {
            // drop index first (some DB engines require it)
            $table->dropIndex(['actual_sent']);
            $table->dropColumn('actual_sent');
        });
    }
};
