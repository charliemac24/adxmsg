<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Class OptinLogger
 *
 * Model for the optin_logger table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property int $contact_id
 * @property string|null $reason
 * @property string $created_at
 */
class OptinLogger extends Model
{
    protected $table = 'optin_logger';

    protected $fillable = [
        'contact_id',
        'reason',
        'created_at',
    ];

    public $timestamps = false; // Only created_at is managed

    /**
     * Get the contact associated with the opt-in log.
     */
    public function contact()
    {
        return $this->belongsTo(Contacts::class, 'contact_id');
    }
}
