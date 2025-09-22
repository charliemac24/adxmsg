<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddStateToMailchimpContactsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        if (!Schema::hasColumn('mailchimp_contacts', 'state')) {
            Schema::table('mailchimp_contacts', function (Blueprint $table) {
                $table->string('state')->nullable()->after('phone');
            });
        }
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        if (Schema::hasColumn('mailchimp_contacts', 'state')) {
            Schema::table('mailchimp_contacts', function (Blueprint $table) {
                $table->dropColumn('state');
            });
        }
    }
}
