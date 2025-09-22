<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UnsubscribeRedirect extends Model
{
    protected $table = 'unsubscribe_redirects';
    protected $fillable = ['contact_id', 'token', 'target_url'];
}
