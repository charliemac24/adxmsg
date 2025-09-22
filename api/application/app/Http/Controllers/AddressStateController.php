<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\AddressState;

/**
 * Class AddressStateController
 *
 * Controller for managing address states.
 *
 * @package App\Http\Controllers
 */
class AddressStateController extends Controller
{
    /**
     * Create a new address state.
     *
     * @param \Illuminate\Http\Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'state' => 'required|string|max:255|unique:address_state,state',
        ]);

        $state = AddressState::create($validated);

        return response()->json($state, 201);
    }

    /**
     * Retrieve all address states.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function index()
    {
        $states = AddressState::all();
        return response()->json($states);
    }

    /**
     * Retrieve an address state by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function show($id)
    {
        $state = AddressState::find($id);
        if (!$state) {
            return response()->json(['message' => 'Address state not found'], 404);
        }
        return response()->json($state);
    }

    /**
     * Update an address state by ID.
     *
     * @param \Illuminate\Http\Request $request
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function update(Request $request, $id)
    {
        $validated = $request->validate([
            'state' => 'required|string|max:255|unique:address_state,state,' . $id,
        ]);

        $state = AddressState::find($id);
        if (!$state) {
            return response()->json(['message' => 'Address state not found'], 404);
        }
        $state->update($validated);
        return response()->json($state);
    }

    /**
     * Delete an address state by ID.
     *
     * @param int $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function destroy($id)
    {
        $state = AddressState::find($id);
        if (!$state) {
            return response()->json(['message' => 'Address state not found'], 404);
        }
        $state->delete();
        return response()->json(['deleted' => true]);
    }
}
