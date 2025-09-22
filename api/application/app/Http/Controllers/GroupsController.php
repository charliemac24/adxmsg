<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Groups;

/**
 * Class GroupsController
 *
 * Controller for managing contact groups.
 *
 * @package App\Http\Controllers
 */
class GroupsController extends Controller
{
    /**
     * Create a new group.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'group_name' => 'required|string|max:255|unique:contact_groups,group_name',
        ]);

        $group = Groups::create($validated);

        return response()->json($group, 201);
    }

    /**
     * Retrieve all groups.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function index()
    {
        $groups = Groups::all();
        return response()->json($groups);
    }

    /**
     * Retrieve a group by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function show($id)
    {
        $group = Groups::find($id);
        if (!$group) {
            return response()->json(['message' => 'Group not found'], 404);
        }
        return response()->json($group);
    }

    /**
     * Update a group by ID.
     *
     * @param \Illuminate\Http\Request $request
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'group_name' => 'required|string|max:255|unique:contact_groups,group_name,' . $id,
        ]);

        $group = Groups::find($id);
        if (!$group) {
            return response()->json(['message' => 'Group not found'], 404);
        }
        $group->update($validated);
        return response()->json($group);
    }

    /**
     * Delete a group by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroy($id)
    {
        $group = Groups::find($id);
        if (!$group) {
            return response()->json(['message' => 'Group not found'], 404);
        }
        $group->delete();
        return response()->json(['deleted' => true]);
    }
}
