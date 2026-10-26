// tsc only emits .js: copy the OpenAPI document next to the compiled app.
import { cpSync } from 'node:fs';

cpSync('src/api/openapi.yaml', 'dist/api/openapi.yaml');
