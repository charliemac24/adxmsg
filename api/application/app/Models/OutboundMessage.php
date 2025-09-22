<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Class OutboundMessage
 *
 * Model for the outbound_messages table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property int $contact_id
 * @property string $to_number
 * @property string $message_body
 * @property string $status
 * @property string|null $twilio_sid
 * @property string|null $error_message
 * @property string $created_at
 * @property string $updated_at
 */
class OutboundMessage extends Model
{
    protected $table = 'outbound_messages';

    protected $fillable = [
        'contact_id',
        'group_id',
        'address_state_id',
        'to_number',
        'message_body',
        'status',
        'twilio_sid',
    'conversation_id',
    'error_message',
    'date_sent',
    ];

    /**
     * Get the contact associated with this outbound message.
     */
    public function contact()
    {
        return $this->belongsTo(Contacts::class, 'contact_id');
    }

    /**
     * Get the group associated with this outbound message.
     */
    public function group()
    {
        return $this->belongsTo(Groups::class, 'group_id');
    }

    /**
     * Get the address state associated with this outbound message.
     */
    public function addressState()
    {
        return $this->belongsTo(AddressState::class, 'address_state_id');
    }

    /**
     * Retrieve inbound messages that share the same conversation id.
     */
    public function inboundMessages()
    {
        return $this->hasMany(InboundMessage::class, 'conversation_id', 'conversation_id');
    }
}
