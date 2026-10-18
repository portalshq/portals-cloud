#!/usr/bin/python3
"""Temporary, root-owned client route for Portals network acceptance.

The operator installs this file in /Library/PrivilegedHelperTools/ with root
ownership once. It binds loopback TCP/UDP, adds one marked hosts entry, and
removes that entry on normal exit or when its unprivileged owner process dies.
"""

import asyncio
import os
import re
import signal
import socket
import subprocess
import sys
import time


def fail(message):
    raise ValueError(message)


def port(value):
    if not re.fullmatch(r"[1-9][0-9]{0,4}", value or ""):
        fail("Invalid port")
    result = int(value)
    if result > 65535:
        fail("Port exceeds 65535")
    return result


def host(value, test_mode):
    if test_mode and value == "127.0.0.1":
        return value
    if not value or len(value) > 253 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]", value):
        fail("Invalid Pinggy hostname")
    if not value.endswith((".run.pinggy-free.link", ".free.pinggy.net", ".pinggy.io")):
        fail("Endpoint is not a Pinggy hostname")
    return value


def target_line(line):
    fields = line.split()
    return bool(fields and not fields[0].startswith("#") and
                {"lore.portals.works", "auth.portals.works"}.intersection(fields[1:]))


def flush_resolver(test_mode):
    if test_mode:
        return
    for args in (("/usr/bin/dscacheutil", "-flushcache"),
                 ("/usr/bin/killall", "-HUP", "mDNSResponder")):
        subprocess.run(args, timeout=5, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, check=False)


async def copy_stream(reader, writer):
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()


class RemoteUdp(asyncio.DatagramProtocol):
    def __init__(self, local_transport, client):
        self.local_transport = local_transport
        self.client = client
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, _address):
        self.local_transport.sendto(data, self.client)


class LocalUdp(asyncio.DatagramProtocol):
    def __init__(self, remote_address, remote_family):
        self.remote_address = remote_address
        self.remote_family = remote_family
        self.transport = None
        self.remotes = {}
        self.lock = asyncio.Lock()

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, client):
        asyncio.create_task(self.forward(data, client))

    async def forward(self, data, client):
        try:
            async with self.lock:
                if client not in self.remotes:
                    if len(self.remotes) >= 32:
                        return
                    transport, _ = await asyncio.get_running_loop().create_datagram_endpoint(
                        lambda: RemoteUdp(self.transport, client),
                        remote_addr=self.remote_address, family=self.remote_family)
                    self.remotes[client] = (transport, time.monotonic())
                transport, _ = self.remotes[client]
                self.remotes[client] = (transport, time.monotonic())
            transport.sendto(data)
        except (OSError, RuntimeError):
            self.discard(client)

    def discard(self, client):
        entry = self.remotes.pop(client, None)
        if entry:
            entry[0].close()

    def expire(self):
        cutoff = time.monotonic() - 600
        for client, (_transport, last_seen) in list(self.remotes.items()):
            if last_seen < cutoff:
                self.discard(client)

    def close(self):
        for client in list(self.remotes):
            self.discard(client)
        if self.transport:
            self.transport.close()


async def run():
    if len(sys.argv) != 8:
        fail("Expected TCP host/port, UDP host/port, local UDP/TCP ports, owner PID")
    test_mode = os.environ.get("PORTALS_ROUTE_TEST_MODE") == "1"
    if test_mode and os.geteuid() == 0:
        fail("Test-mode file override is unavailable to the privileged helper")
    hosts_file = os.environ.get("PORTALS_ROUTE_HOSTS_FILE") if test_mode else "/etc/hosts"
    if not hosts_file:
        fail("Test mode requires a temporary hosts file")
    tcp_host = host(sys.argv[1], test_mode)
    tcp_port = port(sys.argv[2])
    udp_host = host(sys.argv[3], test_mode)
    udp_port = port(sys.argv[4])
    udp_local_port = port(sys.argv[5])
    tcp_local_port = port(sys.argv[6])
    if not test_mode and tcp_local_port != 443:
        fail("Production acceptance uses loopback TCP 443")
    if not re.fullmatch(r"[1-9][0-9]*", sys.argv[7]):
        fail("Invalid owner PID")
    owner_pid = int(sys.argv[7])
    with open(hosts_file, encoding="utf-8") as handle:
        before = handle.read()
    if (any(target_line(line) for line in before.splitlines()) or
            "# portals-network-client-route:" in before or
            "# portals-px-pinggy-test" in before):
        fail("Existing Lore/Auth hosts override or stale fixture marker")
    marker = "# portals-network-client-route:%d" % os.getpid()
    entry = "127.0.0.1 lore.portals.works auth.portals.works %s\n" % marker
    infos = socket.getaddrinfo(udp_host, udp_port, type=socket.SOCK_DGRAM)
    address = next((info for info in infos if info[0] == socket.AF_INET), infos[0])
    remote_family = address[0]
    remote_address = address[4]
    server = None
    local_udp = None
    installed = False
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        loop.add_signal_handler(sig, stop.set)

    async def handle_tcp(client_reader, client_writer):
        try:
            upstream_reader, upstream_writer = await asyncio.open_connection(tcp_host, tcp_port)
            await asyncio.gather(copy_stream(client_reader, upstream_writer),
                                 copy_stream(upstream_reader, client_writer))
        except (OSError, ConnectionError):
            client_writer.close()

    try:
        udp_transport, local_udp = await loop.create_datagram_endpoint(
            lambda: LocalUdp(remote_address, remote_family),
            local_addr=("127.0.0.1", udp_local_port), family=socket.AF_INET)
        server = await asyncio.start_server(handle_tcp, "127.0.0.1", tcp_local_port)
        with open(hosts_file, encoding="utf-8") as handle:
            current = handle.read()
        if any(target_line(line) for line in current.splitlines()):
            fail("Lore/Auth hosts override appeared while starting")
        with open(hosts_file, "a", encoding="utf-8") as handle:
            handle.write(entry)
        installed = True
        flush_resolver(test_mode)
        print("CLIENT_ROUTE_READY tcp=127.0.0.1:%d udp=127.0.0.1:%d" %
              (tcp_local_port, udp_local_port), flush=True)
        while not stop.is_set():
            try:
                os.kill(owner_pid, 0)
            except ProcessLookupError:
                break
            local_udp.expire()
            try:
                await asyncio.wait_for(stop.wait(), timeout=2)
            except asyncio.TimeoutError:
                pass
    finally:
        if server:
            server.close()
            await server.wait_closed()
        if local_udp:
            local_udp.close()
        if installed:
            with open(hosts_file, encoding="utf-8") as handle:
                current = handle.read()
            lines = [line for line in current.splitlines(keepends=True)
                     if not line.rstrip("\r\n").endswith(marker)]
            with open(hosts_file, "w", encoding="utf-8") as handle:
                handle.writelines(lines)
            flush_resolver(test_mode)
            print("CLIENT_ROUTE_CLEANED", flush=True)


if __name__ == "__main__":
    try:
        asyncio.run(run())
    except (OSError, ValueError, asyncio.TimeoutError) as error:
        print("CLIENT_ROUTE_ERROR: %s" % error, file=sys.stderr)
        sys.exit(1)
