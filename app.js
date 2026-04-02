'use strict';

// ── Guard: data.js not yet generated ────────────────────────────────────────
if (typeof window.COURSE_DATA === 'undefined') {
  document.getElementById('data-error').hidden = false;
  throw new Error('data.js not loaded — run scrape.py first.');
}

// ── Build indexes ────────────────────────────────────────────────────────────
const DATA = window.COURSE_DATA;

/** @type {Map<string, object[]>} */
const professorIndex = new Map();
/** @type {Map<string, object[]>} */
const courseIndex = new Map();

for (const rec of DATA) {
  if (!professorIndex.has(rec.instructor)) professorIndex.set(rec.instructor, []);
  professorIndex.get(rec.instructor).push(rec);

  if (!courseIndex.has(rec.course_code)) courseIndex.set(rec.course_code, []);
  courseIndex.get(rec.course_code).push(rec);
}

// Sorted lists for autocomplete
const professorList = [...professorIndex.keys()].sort((a, b) => a.localeCompare(b));
const courseList = [...courseIndex.keys()].sort((a, b) => {
  const numA = parseInt(a.replace('CSS ', ''), 10);
  const numB = parseInt(b.replace('CSS ', ''), 10);
  return numA - numB;
});

// ── State ────────────────────────────────────────────────────────────────────
let mode = 'professor'; // 'professor' | 'course'
let acFocusIdx = -1;    // keyboard nav in autocomplete

// ── DOM refs ─────────────────────────────────────────────────────────────────
const input     = document.getElementById('search-input');
const acList    = document.getElementById('autocomplete-list');
const clearBtn  = document.getElementById('clear-btn');
const results   = document.getElementById('results');
const noResults = document.getElementById('no-results');
const summary   = document.getElementById('summary-line');
const thead     = document.getElementById('results-thead');
const tbody     = document.getElementById('results-tbody');

// ── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hideAc() {
  acList.hidden = true;
  acList.innerHTML = '';
  acFocusIdx = -1;
}

function clearResults() {
  results.hidden = true;
  noResults.hidden = true;
}

function setMode(newMode) {
  mode = newMode;
  document.querySelectorAll('.tab').forEach(t => {
    const isActive = t.dataset.mode === mode;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });
  input.placeholder = mode === 'professor'
    ? 'Type a professor name…'
    : 'Type a course number or name…';
  input.setAttribute('aria-label',
    mode === 'professor' ? 'Search professor name' : 'Search course');
  input.value = '';
  clearResults();
  hideAc();
  clearBtn.hidden = true;
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

// ── Autocomplete ─────────────────────────────────────────────────────────────
function buildAcItems(query) {
  const list   = mode === 'professor' ? professorList : courseList;
  const index  = mode === 'professor' ? professorIndex : courseIndex;
  const q      = query.toLowerCase();

  // Prefer prefix matches first, then substring
  const prefix = list.filter(v => v.toLowerCase().startsWith(q));
  const other  = list.filter(v => !v.toLowerCase().startsWith(q) && v.toLowerCase().includes(q));
  return [...prefix, ...other].slice(0, 15).map(val => {
    let label = escHtml(val);
    if (mode === 'course') {
      const recs = index.get(val);
      if (recs && recs[0]) label += ` <span class="ac-subtitle">— ${escHtml(recs[0].course_name)}</span>`;
    }
    return { val, label };
  });
}

function renderAc(query) {
  if (!query) { hideAc(); return; }
  const items = buildAcItems(query);
  if (!items.length) { hideAc(); return; }

  acList.innerHTML = items.map(({ val, label }, i) =>
    `<li role="option" aria-selected="false" data-value="${escHtml(val)}"
         data-idx="${i}">${label}</li>`
  ).join('');
  acList.hidden = false;
  acFocusIdx = -1;
}

function applyAcFocus(idx) {
  const items = acList.querySelectorAll('li');
  items.forEach((li, i) => li.setAttribute('aria-selected', String(i === idx)));
  acFocusIdx = idx;
}

input.addEventListener('input', () => {
  clearResults();
  clearBtn.hidden = true;
  renderAc(input.value.trim());
});

input.addEventListener('keydown', e => {
  const items = [...acList.querySelectorAll('li')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    applyAcFocus(Math.min(acFocusIdx + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    applyAcFocus(Math.max(acFocusIdx - 1, 0));
  } else if (e.key === 'Enter') {
    if (acFocusIdx >= 0 && items[acFocusIdx]) {
      selectValue(items[acFocusIdx].dataset.value);
    } else if (items.length > 0) {
      selectValue(items[0].dataset.value);
    }
  } else if (e.key === 'Escape') {
    hideAc();
  }
});

acList.addEventListener('click', e => {
  const li = e.target.closest('li');
  if (li) selectValue(li.dataset.value);
});

// Close autocomplete when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.input-wrap')) hideAc();
});

// ── Clear ────────────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  input.value = '';
  clearBtn.hidden = true;
  clearResults();
  hideAc();
  input.focus();
});

// ── Search ───────────────────────────────────────────────────────────────────
function selectValue(val) {
  input.value = val;
  hideAc();
  doSearch(val);
}

function doSearch(val) {
  const index = mode === 'professor' ? professorIndex : courseIndex;
  let recs = index.get(val);

  clearBtn.hidden = false;

  if (!recs || recs.length === 0) {
    results.hidden = true;
    noResults.hidden = false;
    return;
  }

  // Sort newest first
  recs = [...recs].sort((a, b) => b.sort_key - a.sort_key);

  // Summary
  const quarters    = new Set(recs.map(r => r.quarter));
  const courses     = new Set(recs.map(r => r.course_code));
  const instructors = new Set(recs.map(r => r.instructor));

  if (mode === 'professor') {
    summary.textContent =
      `${recs.length} section(s) · ${courses.size} course(s) · ${quarters.size} quarter(s)`;
  } else {
    summary.textContent =
      `${recs.length} section(s) · ${instructors.size} instructor(s) · ${quarters.size} quarter(s)`;
  }

  // Table
  if (mode === 'professor') {
    thead.innerHTML = '<tr><th>Course</th><th>Course Name</th><th>Quarter</th><th>Section</th></tr>';
    tbody.innerHTML = recs.map(r =>
      `<tr>
        <td>${escHtml(r.course_code)}</td>
        <td>${escHtml(r.course_name)}</td>
        <td>${escHtml(r.quarter_label)}</td>
        <td>${escHtml(r.section)}</td>
      </tr>`
    ).join('');
  } else {
    thead.innerHTML = '<tr><th>Instructor</th><th>Quarter</th><th>Section</th></tr>';
    tbody.innerHTML = recs.map(r =>
      `<tr>
        <td>${escHtml(r.instructor)}</td>
        <td>${escHtml(r.quarter_label)}</td>
        <td>${escHtml(r.section)}</td>
      </tr>`
    ).join('');
  }

  noResults.hidden = true;
  results.hidden = false;
}

// ── Inline CSS for autocomplete subtitle ────────────────────────────────────
// (Avoids adding a style rule to style.css for a single decoration)
const style = document.createElement('style');
style.textContent = '.ac-subtitle { color: #888; font-size: .88em; }';
document.head.appendChild(style);
