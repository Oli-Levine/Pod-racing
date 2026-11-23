import os from 'node:os';

// Find the laptop's LAN addresses, best guess first. HOST_IP env var overrides.
export function lanAddresses() {
  if (process.env.HOST_IP) return [{ ip: process.env.HOST_IP, name: 'HOST_IP', score: 999 }];
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // link-local
      let score = 0;
      if (/^192\.168\./.test(a.address)) score += 30;
      else if (/^10\./.test(a.address)) score += 20;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score += 10;
      if (/wi-?fi|wlan|wlp|^en0$|wireless/i.test(name)) score += 15;
      if (/docker|veth|br-|vmnet|vbox|virtual|vethernet|tailscale|utun|^zt|wsl|hyper-v|loopback/i.test(name)) score -= 50;
      out.push({ ip: a.address, name, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
