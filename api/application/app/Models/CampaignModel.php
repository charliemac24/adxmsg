<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CampaignModel extends Model
{
    use HasFactory;

    protected $table = 'campaigns';

    protected $fillable = [
        'title',
        'message',
        'recipient_type',
        'recipients',
        'scheduled_at',
        'status',
        'sent_at',
        'created_by',
    ];

    protected $casts = [
        'recipients' => 'array',
        'scheduled_at' => 'datetime',
        'sent_at' => 'datetime',
    ];
}
