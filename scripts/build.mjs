import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public', { recursive: true });
copyFileSync('shared/regions.js', 'public/regions.js');
console.log('Ready: static app, bundled map, and shared region rules.');
