<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class AddBusinessAndTagsToMailchimpContactsTable extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::table('mailchimp_contacts', function (Blueprint $table) {
            if (!Schema::hasColumn('mailchimp_contacts', 'business_name')) {
                $table->string('business_name')->nullable()->after('last_name');
            }
            if (!Schema::hasColumn('mailchimp_contacts', 'business_address')) {
                $table->text('business_address')->nullable()->after('business_name');
            }
            if (!Schema::hasColumn('mailchimp_contacts', 'tags')) {
                $table->text('tags')->nullable()->after('business_address');
            }
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('mailchimp_contacts', function (Blueprint $table) {
            if (Schema::hasColumn('mailchimp_contacts', 'business_name')) {
                $table->dropColumn('business_name');
            }
            if (Schema::hasColumn('mailchimp_contacts', 'business_address')) {
                $table->dropColumn('business_address');
            }
            if (Schema::hasColumn('mailchimp_contacts', 'tags')) {
                $table->dropColumn('tags');
            }
        });
    }
}
