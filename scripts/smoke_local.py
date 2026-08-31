#!/usr/bin/env python3
import http.server, socketserver, threading, time, urllib.request, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
DIST=ROOT/'dist'
PORT=4173
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
handler=lambda *a,**kw: Quiet(*a,directory=str(DIST),**kw)
with socketserver.TCPServer(('127.0.0.1',PORT),handler) as httpd:
    t=threading.Thread(target=httpd.serve_forever,daemon=True); t.start(); time.sleep(.25)
    for path in ['/', '/assets/app.js', '/logo-64.png', '/manifest.json', '/build-manifest.json']:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}{path}',timeout=3) as r:
            if r.status != 200: raise SystemExit(f'FAIL {path}: {r.status}')
    httpd.shutdown()
print('PASS local static smoke')
