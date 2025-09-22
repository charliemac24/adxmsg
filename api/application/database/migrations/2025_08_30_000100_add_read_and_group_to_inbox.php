<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

class AddReadAndGroupToInbox extends Migration
{
    /**
     * Run the migrations.
     *
     * Adds `is_read`, `read_at`, and `group_number` to the `inbox` table and backfills values
     */
    public function up()
    {
        Schema::table('inbox', function (Blueprint $table) {
            if (!Schema::hasColumn('inbox', 'is_read')) {
                $table->boolean('is_read')->default(false)->after('status');
            }
            if (!Schema::hasColumn('inbox', 'read_at')) {
                $table->timestamp('read_at')->nullable()->after('is_read');
            }
            if (!Schema::hasColumn('inbox', 'group_number')) {
                $table->string('group_number')->nullable()->index()->after('to_number');
            }
        });

        // Backfill group_number as normalized from from_number if present, else to_number
        $rows = DB::table('inbox')->select('id', 'from_number', 'to_number')->get();
        foreach ($rows as $r) {
            $num = null;
            if (!empty($r->from_number)) $num = preg_replace('/\D+/', '', $r->from_number);
            elseif (!empty($r->to_number)) $num = preg_replace('/\D+/', '', $r->to_number);
            if ($num) {
                DB::table('inbox')->where('id', $r->id)->update(['group_number' => $num]);
            }
        }

        // Backfill is_read conservatively:
        // - Mark inbox rows as read if they have a recorded inbound_message_views entry (i.e. we observed a view)
        // - Also mark rows as read for non-inbound sources where status='read' (preserve prior semantics for other sources)

        // 1) Find inbound inbox rows that have a recorded view and mark them read
        if (Schema::hasTable('inbound_message_views')) {
            $viewedIds = DB::table('inbox as i')
                ->join('inbound_message_views as v', function($j) {
                    $j->on('v.inbound_message_id', '=', 'i.source_id');
                })
                ->where('i.source_table', 'inbound_messages')
                ->select('i.id')
                ->pluck('id')
                ->toArray();

            if (!empty($viewedIds)) {
                DB::table('inbox')->whereIn('id', $viewedIds)->update(['is_read' => true, 'read_at' => DB::raw('updated_at')]);
            }
        }

        // 2) For non-inbound sources, preserve previous behaviour: mark status='read' as read
        DB::table('inbox')->where('status', 'read')->where(function($q){
            $q->whereNull('source_table')->orWhere('source_table', '!=', 'inbound_messages');
        })->update(['is_read' => true, 'read_at' => DB::raw('updated_at')]);
    }

    /**
     * Reverse the migrations.
     */
    public function down()
    {
        Schema::table('inbox', function (Blueprint $table) {
            if (Schema::hasColumn('inbox', 'group_number')) $table->dropColumn('group_number');
            if (Schema::hasColumn('inbox', 'read_at')) $table->dropColumn('read_at');
            if (Schema::hasColumn('inbox', 'is_read')) $table->dropColumn('is_read');
        });
    }
}
