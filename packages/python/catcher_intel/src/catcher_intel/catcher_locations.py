"""Catcher-specific pitch locations; never assign a full game to its final catcher."""
import math


def catcher_locations(payload):
    teams = (payload.get('liveData') or {}).get('boxscore', {}).get('teams', {})
    active = {'home': None, 'away': None}
    members, catchers = {}, {}

    def register(player_id):
        if player_id not in members:
            return None
        if player_id not in catchers:
            catchers[player_id] = {'id': player_id, **members[player_id], 'pitches': 0, 'locations': []}
        return catchers[player_id]

    for side in active:
        players = list(teams.get(side, {}).get('players', {}).values())
        for p in players:
            person = p.get('person') or {}
            if isinstance(person.get('id'), int):
                members[person['id']] = {'side': side, 'name': person.get('fullName') or 'Unknown catcher'}
        starters = [p for p in players if p.get('stats', {}).get('fielding', {}).get('gamesStarted') == 1 and (p.get('allPositions') or [{}])[0].get('abbreviation') == 'C']
        if len(starters) == 1:
            active[side] = starters[0]['person']['id']
            register(active[side])
    unattributed = 0
    for play in payload.get('liveData', {}).get('plays', {}).get('allPlays', []) or []:
        for e in play.get('playEvents', []) or []:
            player_id = (e.get('player') or {}).get('id')
            member = members.get(player_id)
            if e.get('isSubstitution') and member:
                side = member['side']
                if (e.get('position') or {}).get('abbreviation') == 'C':
                    active[side] = player_id
                    register(player_id)
                elif active[side] == player_id or active[side] == (e.get('replacedPlayer') or {}).get('id'):
                    active[side] = None
            if not e.get('isPitch'):
                continue
            side = {'top': 'home', 'bottom': 'away'}.get(play.get('about', {}).get('halfInning'))
            catcher = register(active[side]) if side and active[side] is not None else None
            if catcher is None:
                unattributed += 1
                continue
            catcher['pitches'] += 1
            pd = e.get('pitchData') or {}
            coords = pd.get('coordinates') or {}
            x, z, top, bottom = coords.get('pX'), coords.get('pZ'), pd.get('strikeZoneTop'), pd.get('strikeZoneBottom')
            hand = play.get('matchup', {}).get('batSide', {}).get('code')
            if all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in [x, z, top, bottom]) and top > bottom and hand in ['R', 'L']:
                catcher['locations'].append({'x': x, 'z': (z-bottom)/(top-bottom), 'hand': hand, 'swinging_strike': (e.get('details', {}).get('call') or {}).get('code') in ['S', 'W']})
    return {'catchers': list(catchers.values()), 'unattributed_pitches': unattributed}
