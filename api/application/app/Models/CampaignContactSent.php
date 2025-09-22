<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Contacts;
use App\Models\CampaignModel;

class CampaignContactSent extends Model
{
    use HasFactory;

    protected $table = 'campaign_contact_sent';

    protected $fillable = [
        'contact_id',
        'campaign_id',
        'processed',
        'date_processed',
    ];

    protected $casts = [
        'processed' => 'integer',
        'date_processed' => 'datetime',
    ];

    public function contact()
    {
        return $this->belongsTo(Contacts::class, 'contact_id');
    }

    public function campaign()
    {
        return $this->belongsTo(CampaignModel::class, 'campaign_id');
    }
}
