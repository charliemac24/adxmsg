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
            $table->unsignedBigInteger('group_id')->nullable()->after('contact_id');
            $table->unsignedBigInteger('contact_id')->nullable()->change();
            $table->string('to_number')->nullable()->change();

            $table->foreign('group_id')->references('id')->on('contact_groups')->onDelete('set null');
            // If you want to add a foreign key for contact_id as well:
            // $table->foreign('contact_id')->references('id')->on('contacts')->onDelete('set null');
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
            $table->dropForeign(['group_id']);
            $table->dropColumn('group_id');
            // Note: Reverting nullable changes may require specifying previous defaults/types if needed
            $table->integer('contact_id')->nullable(false)->change();
            $table->string('to_number')->nullable(false)->change();
        });
    }
};
