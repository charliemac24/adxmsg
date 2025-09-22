<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateInboundMessageViewsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('inbound_message_views', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('inbound_message_id');
            $table->string('viewer_ip')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('viewed_at')->useCurrent();
            $table->timestamps();

            $table->index('inbound_message_id');
            $table->foreign('inbound_message_id')->references('id')->on('inbound_messages')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('inbound_message_views');
    }
}
