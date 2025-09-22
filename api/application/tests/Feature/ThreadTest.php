<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\InboundMessage;
use App\Models\OutboundMessage;

class ThreadTest extends TestCase
{
    use RefreshDatabase;

    /** @test */
    public function thread_endpoint_returns_inbound_and_outbound_messages()
    {
        // create inbound
        $in = InboundMessage::create([
            'from_number' => '+1234567890',
            'message_body' => 'Hello',
            'status' => 'received',
            'received_at' => now()->toDateTimeString(),
            'twilio_sid' => 'SM_TEST_IN_1',
            'conversation_id' => 'CONV_TEST_1',
        ]);

        // create outbound tied to same conversation
        $out = OutboundMessage::create([
            'to_number' => '+1234567890',
            'message_body' => 'Reply',
            'status' => 'sent',
            'twilio_sid' => 'SM_TEST_OUT_1',
            'conversation_id' => 'CONV_TEST_1',
        ]);

        $resp = $this->getJson('/api/v1/inbound/' . $in->id . '/thread');
        $resp->assertStatus(200);
        $json = $resp->json();
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(2, $json['data']);

        $dirs = array_column($json['data'], 'direction');
        $this->assertContains('inbound', $dirs);
        $this->assertContains('outbound', $dirs);
    }
}
