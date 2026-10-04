#!/usr/bin/env bun
/**
 * tailnet-serve-url — publish a loopback port to this tailnet over HTTPS.
 *
 *   tailnet-serve-url 8080 [https-port]   prints the address a phone can open
 *
 * HTTPS is not decoration: the microphone, web push and installing a page on a
 * phone's home screen all require a secure context, and only devices in the
 * tailnet can reach the result. `tailscale serve` keeps its configuration across
 * restarts, so an existing mapping is reused and this stays safe to re-run.
 */
import { publish } from '../share/pi-cli/tailnet.ts';

const [portArg, httpsArg] = process.argv.slice(2);
const port = Number(portArg);
const httpsPort = httpsArg ? Number(httpsArg) : 443;
if (
  !Number.isInteger(port) ||
  port <= 0 ||
  !Number.isInteger(httpsPort) ||
  httpsPort <= 0
) {
  console.error('usage: tailnet-serve-url <port> [https-port]');
  process.exit(2);
}

const url = publish(port, httpsPort);
if (!url) {
  console.error('tailnet-serve-url: could not publish (is Tailscale up?)');
  process.exit(1);
}
console.log(url);
