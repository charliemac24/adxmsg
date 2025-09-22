<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Class AutoResponseLog
 *
 * Model for the auto_response_logs table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property int $inbound_id
 * @property string $to_number
 * @property string $message_body
 * @property string $status
 * @property string|null $twilio_sid
 * @property string|null $error_message
 * @property string $created_at
 */
class AutoResponseLog extends Model
{
    public $timestamps = false;
    protected $table = 'auto_response_logs';

    protected $fillable = [
        'inbound_id',
        'to_number',
        'message_body',
        'status',
        'twilio_sid',
        'error_message',
        'created_at',
    ];

    /**
     * Get the inbound message associated with this auto response log.
     */
    public function inboundMessage()
    {
        return $this->belongsTo(InboundMessage::class, 'inbound_id');
    }
}
