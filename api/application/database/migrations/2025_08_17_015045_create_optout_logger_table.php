<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateOptoutLoggerTable extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
    {
        Schema::create('optout_logger', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contact_id');
            $table->string('reason')->nullable(); // Optional: store reason for opt-out
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('contact_id')->references('id')->on('contacts')->onDelete('cascade');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down()
    {
        Schema::dropIfExists('optout_logger');
    }
}
