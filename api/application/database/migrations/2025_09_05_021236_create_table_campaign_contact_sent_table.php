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
        Schema::create('campaign_contact_sent', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contact_id')->index();
            $table->unsignedBigInteger('campaign_id')->index();
            $table->unsignedTinyInteger('processed')->default(0);
            $table->timestamp('date_processed')->nullable();
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
        Schema::dropIfExists('campaign_contact_sent');
    }
};
