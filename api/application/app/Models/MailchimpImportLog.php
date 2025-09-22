<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailchimpImportLog extends Model
{
    protected $table = 'mailchimp_import_logs';
    protected $guarded = [];
    protected $casts = [
        'raw_response' => 'array',
    ];
}
