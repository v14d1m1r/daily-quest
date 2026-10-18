#!/usr/bin/env python3
"""Run on the server. Prompts for credentials without recording them in argv/history."""
import getpass
import json
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 2 or sys.argv[1] not in ('create-user', 'reset-password'):
    raise SystemExit('Usage: python3 scripts/account.py create-user|reset-password')
action=sys.argv[1]
email=input('Email: ').strip()
name=input('Ime: ').strip() if action=='create-user' else None
password=getpass.getpass('Nova lozinka (10–128 bytes): ')
if password!=getpass.getpass('Ponovi lozinku: '):
    raise SystemExit('Lozinke se ne poklapaju.')
root=Path(__file__).resolve().parent.parent
result=subprocess.run(['bash', str(root/'scripts/production.sh'), 'exec', '-T', 'app', 'daily-quest', action],input=json.dumps({'email':email,'name':name,'password':password}),text=True)
raise SystemExit(result.returncode)
