import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: null,
  buildCommand: 'npm run build',
  outputDirectory: 'public',
  regions: ['hnd1'],
  functions: { 'api/scores.js': { maxDuration: 30 } },
  headers: [
    { source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] },
  ],
};
