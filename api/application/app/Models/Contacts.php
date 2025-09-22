<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Class Contacts
 *
 * Model for the contacts table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property string $first_name
 * @property string $last_name
 * @property int $address_state
 * @property string $primary_no
 * @property int $group_no
 * @property bool $is_subscribed
 * @property \Carbon\Carbon $created_at
 * @property \Carbon\Carbon $updated_at
 */
class Contacts extends Model
{
    use HasFactory;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'contacts';

    /**
     * The attributes that are mass assignable.
     *
     * @var array
     */
    protected $fillable = [
        'first_name',
        'last_name',
        'address_state',
        'primary_no',
        'email_add',
        'group_no',
        'is_subscribed',
        'unsubscribe_link',
    ];

    public function addressState()
    {
        return $this->belongsTo(AddressState::class, 'address_state');
    }

    public function group()
    {
        return $this->belongsTo(Groups::class, 'group_no');
    }

    public function unsubscribeLink(): string
    {
        $rawKey = config('app.key') ?: env('APP_KEY', '');
        if (strpos($rawKey, 'base64:') === 0) {
            $key = base64_decode(substr($rawKey, 7));
        } else {
            $key = $rawKey;
        }

        $sig = hash_hmac('sha256', (string)$this->id, $key);

        // Use url() or config('app.url') to ensure correct base
        return url("/v1/unsubscribe/{$this->id}/{$sig}");
    }
}
