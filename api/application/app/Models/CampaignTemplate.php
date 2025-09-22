<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CampaignTemplate extends Model
{
    use HasFactory;

    protected $table = 'campaign_templates';

    protected $fillable = [
        'name',
        'message',
        'recipient_type',
        'recipients',
        'created_by',
    ];

    protected $casts = [
        'recipients' => 'array',
    ];
}
