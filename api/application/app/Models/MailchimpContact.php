<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailchimpContact extends Model
{
    protected $table = 'mailchimp_contacts';
    protected $guarded = [];
    protected $casts = [
        'raw' => 'array',
        'synced_at' => 'datetime',
    'tags' => 'array',
    ];

    // Allow convenient access to state
    public function getStateAttribute($value)
    {
        return $value;
    }

    // convenience: return tags as array when stored as comma-separated string
    public function getTagsAttribute($value)
    {
        if (is_array($value)) return $value;
        if (!$value) return [];
        return array_map('trim', explode(',', $value));
    }
}
