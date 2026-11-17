import { isIP } from "node:net";

/** Require HTTPS unless the operator explicitly opts in to loopback/Tailscale HTTP. */
export function notificationOrigin(value: string, allowPrivateHttp = false): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  let privateHost = host === "localhost" || host === "[::1]" || host === "::1";
  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    privateHost = first === 127 || (first === 100 && second >= 64 && second <= 127);
  }
  if ((url.protocol !== "https:" && !(allowPrivateHttp && url.protocol === "http:" && privateHost)) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Invalid notification origin");
  }
  return url;
}
