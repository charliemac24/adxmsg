<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateInboxTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('inbox', function (Blueprint $table) {
            $table->bigIncrements('id');

            // direction: 'inbound' or 'outbound' (or 'campaign')
            $table->string('direction')->index();

            // phone fields
            $table->string('from_number')->nullable()->index();
            $table->string('to_number')->nullable()->index();

            // message body and metadata
            $table->text('message_body')->nullable();
            $table->string('status')->nullable();
            $table->string('twilio_sid')->nullable()->index();
            $table->string('conversation_id')->nullable()->index();
            $table->unsignedBigInteger('contact_id')->nullable()->index();
            $table->unsignedBigInteger('group_id')->nullable()->index();

            // unified timestamp for both inbound/outbound
            $table->timestamp('date_executed')->nullable()->index();

            // preserve original source row id so we can map relations later
            $table->unsignedBigInteger('source_id')->nullable()->index();

            // link to another inbox row (e.g. inbound replies -> outbound row)
            $table->unsignedBigInteger('related_inbox_id')->nullable()->index();

            // keep historic created/updated as well
            $table->timestamps();
            $table->timestamp('archived_at')->nullable()->index();
            $table->boolean('is_starred')->default(false)->index();

            $table->text('error_message')->nullable();
            $table->string('source_table')->nullable()->index();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('inbox');
    }
}
