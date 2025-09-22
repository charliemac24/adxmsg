<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Class ImportCsvLogger
 *
 * Model for the import_csv_logger table.
 *
 * @package App\Models
 *
 * @property int $id
 * @property string $csv_file_name
 * @property int $records_imported
 * @property int $records_skipped
 * @property string $created_at
 */
class ImportCsvLogger extends Model
{
    protected $table = 'import_csv_logger';
    protected $fillable = ['csv_file_name', 'records_imported', 'records_skipped'];
    public $timestamps = false; // If you only have created_at, not updated_at
    const CREATED_AT = 'created_at';
    const UPDATED_AT = null;
}
