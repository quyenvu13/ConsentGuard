#!/usr/bin/env python3
import http.server
import socketserver
import threading
import time
import urllib.request
import pathlib
import json

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
PORT = 0

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

handler = lambda *a, **kw: Quiet(*a, directory=str(DIST), **kw)

with socketserver.TCPServer(('127.0.0.1', PORT), handler) as httpd:
    PORT = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(.25)

    for path in ['/', '/assets/app.js', '/assets/index.css', '/assets/contract-config.js', '/logo-64.png', '/manifest.json', '/build-manifest.json']:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}{path}', timeout=3) as response:
            if response.status != 200:
                raise SystemExit(f'FAIL {path}: {response.status}')

    httpd.shutdown()

app = (DIST / 'assets' / 'app.js').read_text()
css = (DIST / 'assets' / 'index.css').read_text()
config = (DIST / 'assets' / 'contract-config.js').read_text()
manifest = json.loads((DIST / 'build-manifest.json').read_text())

for marker in [
    'authorize_service_action',
    'get_service_action',
    'get_evaluation',
    'DETERMINISTIC_ADVERSARIAL_GUARD',
    'Service actions',
    'Evaluation history',
    'consent epoch',
]:
    if marker not in app:
        raise SystemExit(f'FAIL app marker missing: {marker}')

if '0xB13A47565248c9A11A74b2C20D71aB930960B8a2' in config:
    raise SystemExit('FAIL historical V1 address leaked into production config')
if manifest.get('deployment_status') != 'configured':
    raise SystemExit('FAIL fresh V2 deployment is not configured')
if manifest.get('contract') != '0x5638456fcCBb1BeB8711B6A46bf1818caA32D533':
    raise SystemExit('FAIL build manifest contract mismatch')
if '@media(max-width:560px)' not in css or '@media(max-width:920px)' not in css:
    raise SystemExit('FAIL responsive CSS gates missing')

print('PASS local static assets')
print('PASS V2 service-action UI markers')
print('PASS V2 evaluation/adversarial UI markers')
print('PASS historical V1 address excluded')
print('PASS fresh V2 deployment manifest 0x5638456fcCBb1BeB8711B6A46bf1818caA32D533')
print('PASS responsive CSS gates')
