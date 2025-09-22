<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddDeletedAtToInboxTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('inbox', function (Blueprint $table) {
            if (!Schema::hasColumn('inbox', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('inbox', function (Blueprint $table) {
            if (Schema::hasColumn('inbox', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
}
