#!/usr/bin/env python3
"""Run against the local development API; creates two uniquely named test accounts."""
import datetime
import http.cookiejar
import json
import os
import urllib.error
import urllib.request
import uuid
from zoneinfo import ZoneInfo

BASE = os.environ.get('DAILY_QUEST_URL', 'http://127.0.0.1:3000')

def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

def request(opener, path, method='GET', body=None, expected=200, csrf=True):
    headers = {'Content-Type': 'application/json'}
    if csrf:
        headers['X-Daily-Quest'] = '1'
    req = urllib.request.Request(BASE + '/api' + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read()
    assert response.code == expected, (method, path, response.code, expected, raw)
    return json.loads(raw) if raw else None

first, second = client(), client()
request(first, '/health')
request(first, '/me', expected=401)
request(first, '/auth/register', 'POST', {}, expected=403, csrf=False)
password = 'Local-test-' + uuid.uuid4().hex
email = 'smoke-' + uuid.uuid4().hex + '@example.test'
user = request(first, '/auth/register', 'POST', {'name': 'Test', 'email': email, 'password': password})
assert request(first, '/me')['id'] == user['id']
request(second, '/auth/register', 'POST', {'name': 'Other', 'email': 'smoke-' + uuid.uuid4().hex + '@example.test', 'password': password})
now = datetime.datetime.now(datetime.timezone.utc)
date = now.astimezone(ZoneInfo('Europe/Belgrade')).date().isoformat()
body = {'amount_ml': 250, 'consumed_at': now.isoformat()}
entry = request(first, '/water', 'POST', body, 201)
try:
    summary = request(first, '/water/summary?date=' + date)
    assert summary['total_ml'] == 250 and len(summary['week']) == 7
    assert request(second, '/water/summary?date=' + date)['total_ml'] == 0
    request(second, '/water/' + entry['id'], 'DELETE', expected=404)
    request(second, '/water/' + entry['id'], 'PUT', body, 404)
    body['amount_ml'] = 500
    request(first, '/water/' + entry['id'], 'PUT', body)
    assert request(first, '/water/summary?date=' + date)['total_ml'] == 500
    request(first, '/water', 'POST', {**body, 'amount_ml': 0}, 400)
    request(first, '/water', 'POST', {**body, 'consumed_at': (now + datetime.timedelta(days=1)).isoformat()}, 400)
    request(first, '/settings', 'PUT', {'water_goal_ml': 2500, 'timezone': 'Europe/Belgrade'})
    assert request(first, '/water/summary?date=' + date)['goal_ml'] == 2500
    request(first, '/settings', 'PUT', {'water_goal_ml': 2500, 'timezone': 'invalid'}, 400)
finally:
    request(first, '/water/' + entry['id'], 'DELETE', expected=204)
assert request(first, '/water/summary?date=' + date)['total_ml'] == 0
# Meals share the account timezone and must remain private to their owner.
meal_body = {'name': '  Ovsena kaša  ', 'meal_type': 'breakfast', 'quantity': '1 činija', 'notes': 'Banana i orasi', 'consumed_at': now.isoformat()}
meal = request(first, '/meals', 'POST', meal_body, 201)
try:
    assert meal['name'] == 'Ovsena kaša'
    assert len(request(first, '/meals?date=' + date)) == 1
    assert request(second, '/meals?date=' + date) == []
    request(second, '/meals/' + meal['id'], 'PUT', meal_body, 404)
    request(second, '/meals/' + meal['id'], 'DELETE', expected=404)
    for invalid in [{'name': '  '}, {'meal_type': 'invalid'}, {'notes': 'č' * 2001}, {'consumed_at': (now + datetime.timedelta(days=1)).isoformat()}]:
        request(first, '/meals', 'POST', {**meal_body, **invalid}, 400)
    # Move to an earlier day and verify both lists reflect the change.
    previous = now - datetime.timedelta(days=2)
    previous_date = previous.astimezone(ZoneInfo('Europe/Belgrade')).date().isoformat()
    updated = {**meal_body, 'name': 'Salata', 'meal_type': 'lunch', 'quantity': '', 'notes': '', 'consumed_at': previous.isoformat()}
    result = request(first, '/meals/' + meal['id'], 'PUT', updated)
    assert result['notes'] == '' and result['name'] == 'Salata'
    assert request(first, '/meals?date=' + date) == []
    assert request(first, '/meals?date=' + previous_date)[0]['id'] == meal['id']
    # Belgrade spring DST day begins at 23:00 UTC on the preceding date.
    updated['consumed_at'] = '2026-03-28T23:30:00Z'
    request(first, '/meals/' + meal['id'], 'PUT', updated)
    assert request(first, '/meals?date=2026-03-29')[0]['id'] == meal['id']
    assert request(first, '/meals?date=2026-03-28') == []
    request(first, '/settings', 'PUT', {'water_goal_ml': 2500, 'timezone': 'UTC'})
    assert request(first, '/meals?date=2026-03-28')[0]['id'] == meal['id']
    assert request(first, '/meals?date=2026-03-29') == []
finally:
    request(first, '/meals/' + meal['id'], 'DELETE', expected=204)
request(first, '/meals/' + meal['id'], 'DELETE', expected=404)
request(client(), '/meals?date=' + date, expected=401)
request(client(), '/meals', 'POST', meal_body, 401)
# Task lists and tasks must remain isolated, including cross-owner list assignment.
list_a = request(first, '/task-lists', 'POST', {'name': '  Posao  '}, 201)
assert list_a['name'] == 'Posao'
request(first, '/task-lists', 'POST', {'name': 'Posao'}, 409)
list_b = request(second, '/task-lists', 'POST', {'name': 'Privatno'}, 201)
task_body = {'title': '  Završi izveštaj  ', 'notes': 'Detalji', 'priority': 'high', 'due_date': date, 'list_id': list_a['id']}
task = request(first, '/tasks', 'POST', task_body, 201)
try:
    assert task['title'] == 'Završi izveštaj' and not task['completed']
    assert request(second, '/tasks') == []
    assert request(second, '/task-lists') == [list_b]
    request(second, '/tasks/' + task['id'], 'PUT', task_body, 404)
    request(second, '/tasks/' + task['id'], 'DELETE', expected=404)
    request(second, '/tasks/' + task['id'] + '/completion', 'PUT', {'completed': True}, 404)
    request(second, '/task-lists/' + list_a['id'], 'PUT', {'name': 'X'}, 404)
    request(second, '/task-lists/' + list_a['id'], 'DELETE', expected=404)
    request(first, '/tasks', 'POST', {**task_body, 'list_id': list_b['id']}, 404)
    request(first, '/tasks/' + task['id'], 'PUT', {**task_body, 'list_id': list_b['id']}, 404)
    for invalid in [{'title': ' '}, {'notes': 'x'*2001}, {'priority': 'invalid'}, {'due_date': '1969-01-01'}]:
        request(first, '/tasks', 'POST', {**task_body, **invalid}, 400)
    request(first, '/task-lists', 'POST', {'name': ' '}, 400)
    request(first, '/tasks/' + task['id'] + '/completion', 'PUT', {'completed': True})
    edited = request(first, '/tasks/' + task['id'], 'PUT', {**task_body, 'due_date': None, 'notes': '', 'priority': 'low'})
    assert edited['completed'] and edited['due_date'] is None and edited['notes'] == ''
    assert not request(first, '/tasks/' + task['id'] + '/completion', 'PUT', {'completed': False})['completed']
    request(first, '/task-lists/' + list_a['id'], 'PUT', {'name': 'Lično'})
    request(first, '/task-lists/' + list_a['id'], 'DELETE', expected=204)
    remaining = request(first, '/tasks')
    assert len(remaining) == 1 and remaining[0]['list_id'] is None
finally:
    request(first, '/tasks/' + task['id'], 'DELETE', expected=204)
    if any(item['id'] == list_a['id'] for item in request(first, '/task-lists')):
        request(first, '/task-lists/' + list_a['id'], 'DELETE', expected=204)
    request(second, '/task-lists/' + list_b['id'], 'DELETE', expected=204)
assert request(first, '/tasks') == []
request(client(), '/tasks', expected=401)
request(client(), '/task-lists', expected=401)
request(first, '/auth/logout', 'POST', expected=204)
request(first, '/me', expected=401)
request(first, '/auth/login', 'POST', {'email': email, 'password': 'incorrect'}, 401)
request(first, '/auth/login', 'POST', {'email': email, 'password': password})
assert request(first, '/me')['id'] == user['id']
request(first, '/auth/logout', 'POST', expected=204)
request(second, '/auth/logout', 'POST', expected=204)
print('PASS: health, registration, sessions, CSRF, water CRUD, daily totals, user isolation, validation, settings, meals CRUD, meal validation, timezone/date changes, tasks/list CRUD and isolation, login/logout')
