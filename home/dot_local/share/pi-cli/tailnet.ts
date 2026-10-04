/**
 * Tailscale helpers for the local service CLIs.
 *
 * Serving a loopback port to the tailnet is what makes a phone work: HTTPS is
 * required for the microphone, for web push and for installing a page on the
 * home screen, and only devices in the tailnet can open the address.
 */
import { run } from './proc.ts';

/** This machine's MagicDNS name — the name the HTTPS certificate is issued for. */
export function host(): string | null {
  const status = run(['tailscale', 'status', '--json']);
  if (!status.ok) return null;
  try {
    const name = (JSON.parse(status.out) as { Self?: { DNSName?: string } })
      .Self?.DNSName;
    return name ? name.replace(/\.$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * The loopback upstream each served HTTPS port points at, read from
 * `tailscale serve status`:
 *
 *   https://host:8443 (tailnet only)
 *   |-- / proxy http://127.0.0.1:30141
 */
function servedTargets(statusOutput: string): Map<number, string> {
  const targets = new Map<number, string>();
  let httpsPort: number | null = null;
  for (const line of statusOutput.split('\n')) {
    const header = /^https:\/\/([^\s]+)/.exec(line.trim());
    if (header) {
      const authority = header[1];
      httpsPort = authority.includes(':')
        ? Number(authority.split(':').pop())
        : 443;
      continue;
    }
    const target = /proxy\s+(\S+)/.exec(line);
    if (target && httpsPort !== null) targets.set(httpsPort, target[1]);
  }
  return targets;
}

/**
 * Makes sure `http://127.0.0.1:<port>` is published on `<httpsPort>` and returns
 * its address. `tailscale serve` keeps its configuration across restarts, so a
 * mapping that already points there is left alone and this stays safe to call on
 * every start. A different upstream on that HTTPS port is replaced, since one
 * port serves one address.
 */
export function publish(port: number, httpsPort: number): string | null {
  const name = host();
  if (!name) return null;
  const upstream = `http://127.0.0.1:${port}`;
  const targets = servedTargets(run(['tailscale', 'serve', 'status']).out);
  if (targets.get(httpsPort) !== upstream) {
    if (targets.has(httpsPort)) {
      run(['tailscale', 'serve', `--https=${httpsPort}`, 'off']);
    }
    const served = run([
      'tailscale',
      'serve',
      '--bg',
      `--https=${httpsPort}`,
      upstream,
    ]);
    if (!served.ok) return null;
  }
  // 443 is the default for HTTPS, so do not spell it out.
  return httpsPort === 443 ? `https://${name}` : `https://${name}:${httpsPort}`;
}
