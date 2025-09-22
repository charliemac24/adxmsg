<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            $table->string('conversation_id')->nullable()->index();
        });

        Schema::table('outbound_messages', function (Blueprint $table) {
            $table->string('conversation_id')->nullable()->index();
        });

        // Backfill conversation_id for existing inbound messages: prefer twilio_sid, otherwise generate a uuid
        try {
            $rows = DB::table('inbound_messages')->select('id', 'twilio_sid')->get();
            foreach ($rows as $r) {
                $conv = $r->twilio_sid ?: (string) Str::uuid();
                DB::table('inbound_messages')->where('id', $r->id)->update(['conversation_id' => $conv]);
            }

            // For outbound messages, if they have a twilio_sid use it as a conversation id otherwise leave null
            $orows = DB::table('outbound_messages')->select('id', 'twilio_sid')->get();
            foreach ($orows as $o) {
                if (!empty($o->twilio_sid)) {
                    DB::table('outbound_messages')->where('id', $o->id)->update(['conversation_id' => $o->twilio_sid]);
                }
            }
        } catch (\Exception $e) {
            // ignore backfill failures during migration (safe to run manually later)
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            if (Schema::hasColumn('inbound_messages', 'conversation_id')) {
                $table->dropColumn('conversation_id');
            }
        });

        Schema::table('outbound_messages', function (Blueprint $table) {
            if (Schema::hasColumn('outbound_messages', 'conversation_id')) {
                $table->dropColumn('conversation_id');
            }
        });
    }
};
