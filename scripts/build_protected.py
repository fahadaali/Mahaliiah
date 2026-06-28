#!/usr/bin/env python3
"""يبني نسخة محمية بكلمة مرور للنشر على GitHub Pages.
البيانات مشفّرة AES-256-GCM بمفتاح PBKDF2 مشتق من كلمة المرور،
فلا تُكشف الأسماء/الإقامات دون كلمة المرور الصحيحة."""
import json, os, base64, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
password = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("DASH_PW")
if not password:
    sys.exit("usage: build_protected.py <password>")

data = open(os.path.join(ROOT,'data','data.json'),'rb').read()
salt = os.urandom(16); iv = os.urandom(12); ITER = 200000
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode())
ct = AESGCM(key).encrypt(iv, data, None)
payload = {"salt":base64.b64encode(salt).decode(),"iv":base64.b64encode(iv).decode(),
           "iter":ITER,"ct":base64.b64encode(ct).decode()}

css = open(os.path.join(ROOT,'styles.css'),encoding='utf-8').read()
appjs = open(os.path.join(ROOT,'app.js'),encoding='utf-8').read()
import base64 as b64, io
from PIL import Image
_im = Image.open(os.path.join(ROOT,'assets','logo.jpeg')).convert('RGB'); _im.thumbnail((320,320))
_buf = io.BytesIO(); _im.save(_buf,'JPEG',quality=85)
logo = "data:image/jpeg;base64,"+b64.b64encode(_buf.getvalue()).decode()

# read the shell template
shell = open(os.path.join(ROOT,'scripts','protected_shell.html'),encoding='utf-8').read()
out = (shell
  .replace('/*__CSS__*/', css)
  .replace('__LOGO__', logo)
  .replace('/*__PAYLOAD__*/', json.dumps(payload))
  .replace('/*__APP__*/', appjs))
open(os.path.join(ROOT,'dist_protected.html'),'w',encoding='utf-8').write(out)
print("built dist_protected.html", os.path.getsize(os.path.join(ROOT,'dist_protected.html')),"bytes")
