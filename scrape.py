#!/usr/bin/env python3
"""
Scrapes UWB CSS (Computing & Software Systems) time schedule pages
and writes window.COURSE_DATA to data.js for use by index.html.

Usage:
    pip install requests beautifulsoup4
    python3 scrape.py
"""

import json
import re
import time
import datetime

import requests
from bs4 import BeautifulSoup

# ── Quarter list ──────────────────────────────────────────────────────────────
# Autumn 2021 → Summer 2025 (16 quarters). AUT2025+ requires Shibboleth login.

QUARTER_ORDER  = {'WIN': 1, 'SPR': 2, 'SUM': 3, 'AUT': 4}
QUARTER_LABEL  = {'WIN': 'Winter', 'SPR': 'Spring', 'SUM': 'Summer', 'AUT': 'Autumn'}

def build_quarters():
    qs = []
    for year in range(2021, 2026):
        for season in ['WIN', 'SPR', 'SUM', 'AUT']:
            if year == 2021 and season in ('WIN', 'SPR', 'SUM'):
                continue
            if year == 2025 and season == 'AUT':
                continue   # requires auth
            qs.append(f'{season}{year}')
    return qs

QUARTERS = build_quarters()

BASE_URL = 'https://www.washington.edu/students/timeschd/B/{q}/css.html'
PUB_URL  = 'https://www.washington.edu/students/timeschd/pub/B/{q}/css.html'

HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; UWB-CSS-Scraper/1.0)'}


# ── Helpers ───────────────────────────────────────────────────────────────────

def quarter_meta(q):
    season, year = q[:3], int(q[3:])
    return {
        'quarter_order': QUARTER_ORDER[season],
        'quarter_label': f'{QUARTER_LABEL[season]} {year}',
        'year': year,
        'sort_key': year * 10 + QUARTER_ORDER[season],
    }


_SKIP = {'STAFF', 'TBA', 'TO BE ANNOUNCED', 'TO BE ARRANGED', '', 'TO BE ARR'}

def normalize_instructor(raw: str):
    raw = raw.strip()
    upper = raw.upper().rstrip('.')
    if not raw or upper in _SKIP:
        return None
    parts = raw.split(',', 1)
    if len(parts) == 2:
        last = parts[0].strip().title()
        first = parts[1].strip().title()
        return f'{last}, {first}'
    return raw.title()


_ROMAN_FIX = [
    (r'\bIi\b',  'II'),
    (r'\bIii\b', 'III'),
    (r'\bIv\b',  'IV'),
    (r'\bCs\b',  'CS'),
    (r'\bSe\b',  'SE'),
    (r'\bUx\b',  'UX'),
    (r'\bAi\b',  'AI'),
    (r'\bDb\b',  'DB'),
]

def smart_title(s: str) -> str:
    s = s.title()
    for pat, repl in _ROMAN_FIX:
        s = re.sub(pat, repl, s)
    return s


SLN_RE = re.compile(r'(\d{5})\s+([A-Z]{1,2})\s+')

# Course header bgcolor encodes the season:
#   Autumn → #ffcccc (pink)   Winter → #99ccff (blue)
#   Spring → #ccffcc (green)  Summer → #ffffcc (yellow)
HEADER_COLORS = {'#ffcccc', '#99ccff', '#ccffcc', '#ffffcc'}


# ── Core parser ───────────────────────────────────────────────────────────────

def parse_quarter(q: str) -> list:
    """Fetch and parse one quarter's CSS schedule. Returns list of record dicts."""
    meta = quarter_meta(q)
    records = []
    current_code = None
    current_name = None

    # Try authenticated URL first; fall back to public if redirected to login
    for url_tmpl in (BASE_URL, PUB_URL):
        url = url_tmpl.format(q=q)
        try:
            resp = requests.get(url, headers=HEADERS, timeout=20, allow_redirects=True)
        except requests.RequestException as e:
            print(f'    network error ({url_tmpl[:30]}…): {e}')
            continue

        # If redirected to Shibboleth login, try the other URL
        if 'weblogin' in resp.url or 'shibboleth' in resp.url.lower():
            print(f'    {url_tmpl.split("/")[6][:3]} URL requires auth, trying fallback…')
            continue

        soup = BeautifulSoup(resp.text, 'html.parser')

        for table in soup.find_all('table'):
            bg = (table.get('bgcolor') or '').lower()

            # ── Course header table ──
            if bg in HEADER_COLORS:
                anchors = table.find_all('a')
                if len(anchors) >= 2:
                    name_attr = anchors[0].get('name', '')
                    m = re.match(r'css(\d{3}[a-z]?)', name_attr, re.IGNORECASE)
                    if m:
                        current_code = f'CSS {m.group(1).upper()}'
                        current_name = smart_title(anchors[1].get_text(strip=True))
                continue

            # ── Section table ──
            if current_code is None:
                continue
            pre = table.find('pre')
            if not pre:
                continue

            text = pre.get_text()
            for line in text.split('\n'):
                line = line.rstrip('\r')
                if not SLN_RE.search(line):
                    continue
                m = SLN_RE.search(line)
                section = m.group(2)

                # Instructor lives at roughly col 56–82
                instr_raw = line[56:83] if len(line) > 56 else ''
                # If that slice has "Open"/"Closed" we've over-run; shift left
                if re.search(r'\b(Open|Closed)\b', instr_raw, re.IGNORECASE):
                    instr_raw = line[48:75] if len(line) > 48 else instr_raw

                instructor = normalize_instructor(instr_raw)
                if not instructor:
                    continue

                records.append({
                    'quarter':       q,
                    'quarter_label': meta['quarter_label'],
                    'year':          meta['year'],
                    'quarter_order': meta['quarter_order'],
                    'sort_key':      meta['sort_key'],
                    'course_code':   current_code,
                    'course_name':   current_name,
                    'section':       section,
                    'instructor':    instructor,
                })

        # If we got here without redirect, no need to try fallback
        break

    return records


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    all_records = []
    for q in QUARTERS:
        print(f'Fetching {q}…', end=' ', flush=True)
        try:
            records = parse_quarter(q)
            all_records.extend(records)
            print(f'{len(records)} sections')
        except Exception as e:
            print(f'ERROR: {e}')
        time.sleep(0.5)  # polite crawling

    # Deduplicate (same SLN can appear if both URL attempts succeed)
    seen = set()
    unique = []
    for r in all_records:
        key = (r['quarter'], r['course_code'], r['section'], r['instructor'])
        if key not in seen:
            seen.add(key)
            unique.append(r)

    timestamp = datetime.datetime.now().isoformat(timespec='seconds')
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write(f'// Generated by scrape.py on {timestamp}\n')
        f.write('// Do not edit manually — re-run scrape.py to refresh.\n')
        f.write('window.COURSE_DATA = ')
        json.dump(unique, f, ensure_ascii=False, indent=2)
        f.write(';\n')

    print(f'\nDone. {len(unique)} records → data.js')
    quarters_found = sorted(set(r['quarter'] for r in unique))
    print(f'Quarters: {quarters_found}')
    print(f'Instructors: {len(set(r["instructor"] for r in unique))}')


if __name__ == '__main__':
    main()
