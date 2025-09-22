<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('deleted_inbound_twilio_sids', function (Blueprint $table) {
            $table->id();
            $table->string('twilio_sid')->unique();
            $table->unsignedBigInteger('deleted_by')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('deleted_inbound_twilio_sids');
    }
};
