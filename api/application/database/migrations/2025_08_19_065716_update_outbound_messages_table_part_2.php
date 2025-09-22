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
            $table->unsignedBigInteger('address_state_id')->nullable()->after('group_id');
            $table->foreign('address_state_id')->references('id')->on('address_state')->onDelete('set null');
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
            $table->dropForeign(['address_state_id']);
            $table->dropColumn('address_state_id');
        });
    }
};
