<?php
return [
    'paths' => ['api/*', 'v1/*'],
    'allowed_methods' => ['*'],
    // Revert to specific frontend origins to avoid CORS issues (do not use '*')
    // Update this list if your frontend runs on other hosts/ports in dev/production.
    'allowed_origins' => [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
