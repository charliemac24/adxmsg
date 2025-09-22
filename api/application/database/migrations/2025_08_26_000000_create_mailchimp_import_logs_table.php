<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateMailchimpImportLogsTable extends Migration
{
    public function up()
    {
        Schema::create('mailchimp_import_logs', function (Blueprint $table) {
            $table->id();
            $table->string('filename')->nullable();
            $table->string('audience_id')->nullable();
            $table->integer('imported_count')->default(0);
            $table->json('raw_response')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('mailchimp_import_logs');
    }
}
