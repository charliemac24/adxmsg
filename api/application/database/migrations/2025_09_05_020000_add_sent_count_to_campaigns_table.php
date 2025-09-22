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
            // Add an integer sent_count column with default 0
            $table->unsignedInteger('sent_count')->default(0)->after('actual_sent')->index();
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
            // drop index first then the column
            $table->dropIndex(['sent_count']);
            $table->dropColumn('sent_count');
        });
    }
};