// Builds the game into host/www/ for the no-install Python host (iPad etc.)
// and writes host/www/host-config.json from config.js so both servers share settings.
import { build } from 'vite';
import fs from 'node:fs';
import { CONFIG } from '../config.js';

await build({ build: { outDir: 'host/www', emptyOutDir: true }, logLevel: 'warn' });
const { maxPlayers, playerColors, net } = CONFIG;
fs.writeFileSync('host/www/host-config.json', JSON.stringify({ port: net.port, maxPlayers, playerColors, net }, null, 2));
console.log('host/www built - commit it so the iPad gets the latest game.');
