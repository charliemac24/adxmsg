<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Inbox extends Model
{
    use SoftDeletes;
    protected $table = 'inbox';

    protected $fillable = [
        'direction',
        'from_number',
        'to_number',
        'message_body',
        'status',
        'twilio_sid',
        'conversation_id',
        'contact_id',
        'group_id',
        'date_executed',
        'is_starred',
        'archived_at',
        'source_table',
    'source_id',
    'related_inbox_id',
        'error_message',
    ];

    protected $casts = [
        'date_executed' => 'datetime',
        'is_starred' => 'boolean',
        'archived_at' => 'datetime',
    'related_inbox_id' => 'integer',
    'deleted_at' => 'datetime',
    ];
}
