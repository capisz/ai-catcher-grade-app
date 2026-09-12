"""Read-only smoke check against a running, populated local or hosted app."""
import os
import requests

base = os.getenv('CHECK_BASE_URL', 'http://localhost:3000').rstrip('/')

def get(path):
    response = requests.get(base + '/api/backend' + path, timeout=60)
    response.raise_for_status()
    print('PASS', path, flush=True)
    return response.json()

assert get('/health')['status'] == 'ok'
metadata = get('/app/metadata')
catchers = get('/catchers')['catchers']
assert len(catchers) >= 2, 'Need at least two scored catchers'
a, b = [row['catcher_id'] for row in catchers[:2]]
assert get('/catchers/leaderboard')['leaderboard'], 'Leaderboard must be populated'
get('/catchers/leaderboard?date_from=2025-04-01&date_to=2025-04-30')
get('/catchers?team=LAD')
get(f'/catchers/compare?catcher_a={a}&catcher_b={b}')
get(f'/catchers/{a}')
for suffix in ['counts', 'pitch-types', 'location-summary', 'report/options']:
    get(f'/catchers/{a}/{suffix}')
pairings = get(f'/catchers/{a}/pairings')['pairings']
assert pairings, 'Need pitcher pairings for Game mode'
pitcher = pairings[0]['pitcher_id']
assert get(f'/atbat/recommendation?pitcher_id={pitcher}&stand=R&p_throws=R')['options']
for path in ['/scouting', '/compare', '/matchup-explorer', '/research']:
    response = requests.get(base + path, timeout=90)
    response.raise_for_status()
    assert 'Proxy could not reach' not in response.text
    print('PASS page', path, flush=True)
