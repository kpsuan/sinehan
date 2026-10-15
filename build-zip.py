"""Packs extension/ into sinehan-extension.zip (to send) and server/public/ (the website's Download button).

Run from this folder:  python build-zip.py
"""
import json
import os
import shutil
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.join(ROOT, 'extension')
OUT = os.path.join(ROOT, 'sinehan-extension.zip')
SITE_COPY = os.path.join(ROOT, 'server', 'public', 'sinehan-extension.zip')

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for folder, _, files in os.walk(EXT):
        for name in files:
            full = os.path.join(folder, name)
            # Forward slashes inside the zip, so it unzips correctly on Mac too.
            z.write(full, 'sinehan/' + os.path.relpath(full, EXT).replace(os.sep, '/'))
shutil.copyfile(OUT, SITE_COPY)

version = json.load(open(os.path.join(EXT, 'manifest.json'), encoding='utf-8'))['version']
print(f'Built Sinehan {version}: {os.path.getsize(OUT) // 1024} KB -> sinehan-extension.zip and server/public/')
