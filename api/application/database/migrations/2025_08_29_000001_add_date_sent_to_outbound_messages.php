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
        Schema::table('outbound_messages', function (Blueprint $table) {
            // store Twilio's dateSent/dateCreated as a separate column so we don't
            // conflate it with created_at which may be set by local writes
            $table->dateTime('date_sent')->nullable()->after('twilio_sid');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('outbound_messages', function (Blueprint $table) {
            $table->dropColumn('date_sent');
        });
    }
};
