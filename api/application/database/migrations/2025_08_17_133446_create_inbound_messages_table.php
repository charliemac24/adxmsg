<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateInboundMessagesTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('inbound_messages', function (Blueprint $table) {
            $table->id();
            $table->string('from_number');
            $table->text('message_body');
            $table->string('status')->default('received');
            $table->timestamp('received_at')->nullable();
            $table->string('twilio_sid')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('inbound_messages');
    }
}
