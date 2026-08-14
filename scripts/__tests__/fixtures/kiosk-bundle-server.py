#!/usr/bin/env python3
"""Minimal stand-in for the hub's /api/display/kiosk-bundle endpoint.

Used by kiosk-update.test.sh to exercise the spoke updater end to end without
a Next.js server. It serves whatever is currently in the state directory, so a
test can change the advertised version or corrupt the checksum between runs
without restarting anything:

    <state>/manifest.json   -> served for ?manifest=1
    <state>/bundle.tar.gz   -> served otherwise

Usage: kiosk-bundle-server.py <port> <state-dir>
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

STATE = sys.argv[2]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - name fixed by BaseHTTPRequestHandler
        if not self.path.startswith("/api/display/kiosk-bundle"):
            self.send_error(404)
            return

        if "manifest=1" in self.path:
            path, ctype = os.path.join(STATE, "manifest.json"), "application/json"
        else:
            path, ctype = os.path.join(STATE, "bundle.tar.gz"), "application/gzip"

        if not os.path.exists(path):
            self.send_error(503)
            return

        with open(path, "rb") as fh:
            body = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # keep the test output readable


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
