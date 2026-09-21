const os = require('os');

// Picks the Mac's own LAN IP so the admin never has to run `ipconfig
// getifaddr en0` by hand - prefers a real WiFi/Ethernet interface over
// anything virtual (VPN adapters, Docker bridges, etc. show up here too).
function getLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      candidates.push({ name, address: addr.address });
    }
  }

  if (candidates.length === 0) return null;

  // en0 is the Mac's usual WiFi interface name - prefer it, then any en*,
  // then whatever's left, so a VPN/utun interface doesn't win by accident.
  const byPreference = (a, b) => {
    const rank = (n) => (n === 'en0' ? 0 : /^en\d+$/.test(n) ? 1 : 2);
    return rank(a.name) - rank(b.name);
  };
  candidates.sort(byPreference);
  return candidates[0].address;
}

module.exports = { getLanIp };
