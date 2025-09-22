<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailchimpImportTask extends Model
{
    protected $table = 'mailchimp_import_tasks';
    protected $guarded = [];
    protected $casts = [
        'queued_at' => 'datetime',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
    ];
}
