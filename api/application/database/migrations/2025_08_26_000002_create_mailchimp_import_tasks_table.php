<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateMailchimpImportTasksTable extends Migration
{
    public function up()
    {
        Schema::create('mailchimp_import_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('filename')->nullable();
            $table->string('audience_id')->nullable();
            $table->string('storage_path')->nullable();
            $table->string('status')->default('queued'); // queued, processing, completed, failed
            $table->integer('imported_count')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('queued_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('mailchimp_import_tasks');
    }
}
