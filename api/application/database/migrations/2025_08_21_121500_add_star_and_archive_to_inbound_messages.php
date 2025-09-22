<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddStarAndArchiveToInboundMessages extends Migration
{
    public function up()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            $table->boolean('is_starred')->default(false)->after('status');
            $table->timestamp('archived_at')->nullable()->after('is_starred');
        });
    }

    public function down()
    {
        Schema::table('inbound_messages', function (Blueprint $table) {
            $table->dropColumn(['is_starred', 'archived_at']);
        });
    }
}
