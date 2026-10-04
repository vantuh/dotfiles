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
 * Makes sure `http://127.0.0.1:<port>` is published on `<httpsPort>` and returns
 * its address. `tailscale serve` keeps its configuration across restarts, so an
 * existing mapping is left alone and this stays safe to call on every start.
 */
export function publish(port: number, httpsPort: number): string | null {
  const name = host();
  if (!name) return null;
  const status = run(['tailscale', 'serve', 'status']);
  const upstream = `http://127.0.0.1:${port}`;
  if (!status.out.includes(upstream)) {
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
