<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('unsubscribe_redirects', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('contact_id')->nullable()->index();
            $table->string('token', 64)->unique();
            $table->text('target_url');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('unsubscribe_redirects');
    }
};
