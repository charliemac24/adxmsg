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
        Schema::table('import_csv_logger', function (Blueprint $table) {
            $table->integer('records_skipped')->default(0)->after('records_imported');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('import_csv_logger', function (Blueprint $table) {
            $table->dropColumn('records_skipped');
        });
    }
};
