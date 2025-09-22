<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InboundMessageView extends Model
{
    protected $table = 'inbound_message_views';

    protected $fillable = [
        'inbound_message_id',
        'viewer_ip',
        'user_agent',
        'viewed_at',
    ];

    public function message()
    {
        return $this->belongsTo(InboundMessage::class, 'inbound_message_id');
    }
}
