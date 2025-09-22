<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('mailchimp_contacts', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('mailchimp_id')->nullable()->index();
            $table->string('email')->nullable()->index();
            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable();
            $table->json('raw')->nullable();
            $table->string('audience_id')->nullable()->index();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('mailchimp_contacts');
    }
};
