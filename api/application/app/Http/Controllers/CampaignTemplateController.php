<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\CampaignTemplate;

class CampaignTemplateController extends Controller
{
    public function index()
    {
        $templates = CampaignTemplate::orderBy('created_at', 'desc')->get();
        return response()->json($templates);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'message' => 'required|string',
            'recipient_type' => 'sometimes|in:person,group,state',
            'recipients' => 'sometimes|array',
        ]);

        // Normalize recipient_type: if recipients are provided but recipient_type is missing, try to infer
        $recipientType = $validated['recipient_type'] ?? null;
        $recipients = $validated['recipients'] ?? null;

        // Basic server-side validation: ensure recipients exist for the given type
        if (!empty($recipients) && is_array($recipients) && $recipientType) {
            if ($recipientType === 'person') {
                $count = \App\Models\Contacts::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more contact ids are invalid.'], 422);
                }
            } elseif ($recipientType === 'group') {
                $count = \App\Models\Groups::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more group ids are invalid.'], 422);
                }
            } elseif ($recipientType === 'state') {
                $count = \App\Models\AddressState::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more state ids are invalid.'], 422);
                }
            }
        }

        $template = CampaignTemplate::create([
            'name' => $validated['name'],
            'message' => $validated['message'],
            'recipient_type' => $recipientType ?? null,
            'recipients' => $recipients ?? null,
            'created_by' => auth()->id() ?? null,
        ]);

        return response()->json(['message' => 'Template saved.', 'template' => $template], 201);
    }

    public function show($id)
    {
        $template = CampaignTemplate::find($id);
        if (!$template) return response()->json(['message' => 'Template not found.'], 404);
        return response()->json($template);
    }

    public function destroy($id)
    {
        $template = CampaignTemplate::find($id);
        if (!$template) return response()->json(['message' => 'Template not found.'], 404);
        $template->delete();
        return response()->json(['message' => 'Template deleted.']);
    }

    public function update(Request $request, $id)
    {
        $template = CampaignTemplate::find($id);
        if (!$template) return response()->json(['message' => 'Template not found.'], 404);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'message' => 'required|string',
            'recipient_type' => 'sometimes|in:person,group,state',
            'recipients' => 'sometimes|array',
        ]);

        $recipientType = $validated['recipient_type'] ?? $template->recipient_type;
        $recipients = $validated['recipients'] ?? $template->recipients;

        // Validate recipients if provided
        if (!empty($recipients) && is_array($recipients) && $recipientType) {
            if ($recipientType === 'person') {
                $count = \App\Models\Contacts::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more contact ids are invalid.'], 422);
                }
            } elseif ($recipientType === 'group') {
                $count = \App\Models\Groups::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more group ids are invalid.'], 422);
                }
            } elseif ($recipientType === 'state') {
                $count = \App\Models\AddressState::whereIn('id', $recipients)->count();
                if ($count !== count($recipients)) {
                    return response()->json(['message' => 'One or more state ids are invalid.'], 422);
                }
            }
        }

        $template->name = $validated['name'];
        $template->message = $validated['message'];
        $template->recipient_type = $recipientType ?? null;
        $template->recipients = $recipients ?? null;
        $template->save();

        return response()->json(['message' => 'Template updated.', 'template' => $template]);
    }

    // Optional: send a template directly (uses existing CampaignController sendCampaign logic)
    public function sendTemplate($id)
    {
        $template = CampaignTemplate::find($id);
        if (!$template) return response()->json(['message' => 'Template not found.'], 404);

        $campaignController = new CampaignController();
        $data = [
            'title' => $template->name,
            'message' => $template->message,
            'recipient_type' => $template->recipient_type ?? 'person',
            'recipients' => $template->recipients ?? [],
        ];

        try {
            $sentCount = $campaignController->sendCampaign($data);
            return response()->json(['message' => 'Template sent.', 'sent' => $sentCount]);
        } catch (\Exception $e) {
            \Log::error('Failed to send template: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to send template.'], 500);
        }
    }
}
