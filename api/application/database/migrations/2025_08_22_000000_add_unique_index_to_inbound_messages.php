<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddUniqueIndexToInboundMessages extends Migration
{
    /**
     * Run the migrations.
     *
     * WARNING: If duplicate non-null twilio_sid values already exist this migration will fail.
     * Make sure to deduplicate the table first (see notes in README below).
     *
     * @return void
     */
    public function up()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            // add a unique index on twilio_sid to prevent future duplicates
            $table->unique('twilio_sid', 'ux_inbound_twilio_sid');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            $table->dropUnique('ux_inbound_twilio_sid');
        });
    }
}
