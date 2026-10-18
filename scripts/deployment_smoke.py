#!/usr/bin/env python3
"""LOCAL DEVELOPMENT ONLY. Requires built binary and closed-registration API on port 3099.
Creates a unique test account in the local development database, leaves account for audit.
Run server: BIND_ADDRESS=127.0.0.1:3099 REGISTRATION_ENABLED=false cargo run
"""
import http.cookiejar
import json
from pathlib import Path
import subprocess
import urllib.request
import urllib.error
import uuid

root=Path(__file__).resolve().parent.parent
base='http://127.0.0.1:3099/api'
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path, method='GET', body=None, status=200):
    req=urllib.request.Request(base+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Daily-Quest':'1'})
    try: response=client.open(req,timeout=10)
    except urllib.error.HTTPError as error: response=error
    assert response.code==status, (path,response.code,status)
    payload=response.read()
    return json.loads(payload) if payload else None

def admin(action, payload):
    # No passwords in argv or logs.
    subprocess.run([str(root/'target/debug/daily-quest'),action],cwd=root,input=json.dumps(payload),text=True,check=True,capture_output=True)

assert request('/config')['registration_enabled'] is False
email='deploy-test-'+uuid.uuid4().hex+'@example.test'
password='Test-'+uuid.uuid4().hex
payload={'email':email,'password':password,'name':'Deployment test'}
request('/auth/register','POST',payload,403)
admin('create-user',payload)
request('/auth/login','POST',payload)
assert request('/me')['email']==email
replacement={**payload,'password':'New-'+uuid.uuid4().hex}
admin('reset-password',replacement)
request('/me',status=401)
request('/auth/login','POST',payload,401)
request('/auth/login','POST',replacement)
assert request('/me')['email']==email
request('/auth/logout','POST',status=204)
print('PASS: registration closed, admin account creation, login, password reset, session revocation, logout')
