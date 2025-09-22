<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Class InboundMessage
 *
 * Model for the inbound_messages table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property string $from_number
 * @property string $message_body
 * @property string $status
 * @property string|null $received_at
 * @property string|null $twilio_sid
 * @property string $created_at
 * @property string $updated_at
 */
class InboundMessage extends Model
{
    protected $table = 'inbound_messages';

    protected $fillable = [
        'from_number',
        'message_body',
        'status',
        'received_at',
    'twilio_sid',
    'conversation_id',
    ];

    /**
     * Get the auto response logs for this inbound message.
     */
    public function autoResponseLogs()
    {
        return $this->hasMany(AutoResponseLog::class, 'inbound_id');
    }

    /**
     * Get all messages (inbound + outbound) for this conversation.
     */
    public function conversationMessages()
    {
        return $this->hasMany(OutboundMessage::class, 'conversation_id', 'conversation_id');
    }
}
