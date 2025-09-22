<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateAutoResponseLogsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('auto_response_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('inbound_id');
            $table->string('to_number');
            $table->text('message_body');
            $table->string('status')->default('sent');
            $table->string('twilio_sid')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('inbound_id')->references('id')->on('inbound_messages')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('auto_response_logs');
    }
};
