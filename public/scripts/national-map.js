const root = document.getElementById('timeline');
if (root) {
  const el = id => document.getElementById(id);
  const years = JSON.parse(root.dataset.years);
  const groups = JSON.parse(root.dataset.groups);
  const paths = [...root.querySelectorAll('[data-area]')];
  const hexes = paths.map(p => p.getAttribute('d'));
  const positions = paths.map(p => p.getAttribute('transform'));
  const rows = [...root.querySelectorAll('[data-row]')];
  const names = rows.map(r => r.querySelector('a').textContent);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cache = new Map();
  let timer = null, revision = 0;
  let state = { m: 'population', y: 2025, g: 'white_british', c: '2021', v: 'hex', a: 0 };
  const load = async file => {
    if (!cache.has(file)) cache.set(file, fetch(`/maps/data/${file}.json`).then(r => {
      if (!r.ok) throw new Error('Map data could not be loaded.');
      return r.json();
    }).catch(e => { cache.delete(file); throw e; }));
    return cache.get(file);
  };
  function pause(announce = true) {
    if (timer) clearInterval(timer);
    timer = null;
    el('map-play').textContent = 'Play';
    el('map-play').setAttribute('aria-pressed', 'false');
    if (announce) el('map-status').textContent = `${el('map-heading').textContent}. ${names[state.a]}: ${rows[state.a].querySelector('td').textContent}.`;
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const year = Number(p.get('y')), area = Number(p.get('a'));
    state = {
      m: p.get('m') === 'ethnicity' ? 'ethnicity' : 'population',
      y: years.includes(year) ? year : 2025,
      g: groups.some(g => g.key === p.get('g')) ? p.get('g') : 'white_british',
      c: ['2011', '2021', 'change'].includes(p.get('c')) ? p.get('c') : '2021',
      v: p.get('v') === 'geographic' ? 'geographic' : 'hex',
      a: Number.isInteger(area) && area >= 0 && area < rows.length ? area : 0,
    };
  }
  function writeHash() { history.replaceState(null, '', `#${new URLSearchParams(Object.entries(state).map(([k,v]) => [k,String(v)]))}`); }
  function bars(data) {
    const box = el('composition-bars');
    box.replaceChildren();
    groups.forEach((g, i) => {
      const section = document.createElement('section');
      const heading = document.createElement('h4');
      heading.textContent = g.label;
      section.append(heading);
      [2011, 2021].forEach((year, y) => {
        const value = data[state.a][y][i];
        const label = document.createElement('p');
        label.textContent = `${year}: ${value == null ? 'n/a' : `${value.toFixed(1)}%`}`;
        const track = document.createElement('div');
        track.style.cssText = 'height:10px;background:#252b33;margin-bottom:8px';
        track.setAttribute('aria-hidden', 'true');
        const bar = document.createElement('div');
        bar.style.cssText = `height:100%;width:${value ?? 0}%;background:${g.fill}`;
        track.append(bar); section.append(label, track);
      });
      box.append(section);
    });
  }
  function legend(scale) {
    el('map-legend').replaceChildren();
    scale.colours.forEach((colour, i) => {
      const item = document.createElement('span'), swatch = document.createElement('i');
      swatch.style.background = colour;
      const label = i === 0 ? `Under ${scale.labels[0]}` : i === scale.colours.length - 1 ? `${scale.labels[i - 1]} and above` : `${scale.labels[i - 1]} to ${scale.labels[i]}`;
      item.append(swatch, document.createTextNode(label)); el('map-legend').append(item);
    });
  }
  async function render(save = true, announce = true) {
    const version = ++revision;
    root.setAttribute('aria-busy', 'true');
    try {
      const ethnicity = state.m === 'ethnicity';
      const data = await load(ethnicity ? 'ethnicity' : 'population');
      const geography = state.v === 'geographic' ? await load('geography') : hexes;
      if (version !== revision) return;
      const f = ethnicity ? (state.c === 'change' ? data.frames[state.g].change : data.frames[state.g].years.find(f => f.year === Number(state.c))) : data.find(f => f.year === state.y);
      paths.forEach((p, i) => {
        p.setAttribute('d', geography[i]); p.setAttribute('fill', f.rows[i][1]);
        if (state.v === 'hex') p.setAttribute('transform', positions[i]); else p.removeAttribute('transform');
        p.querySelector('title').textContent = `${names[i]}: ${f.rows[i][0]}`;
        rows[i].querySelector('td').textContent = f.rows[i][0];
      });
      const period = ethnicity ? state.c === 'change' ? '' : `: Census ${state.c}` : `: mid-${state.y}`;
      el('map-heading').textContent = f.title + period;
      el('map-svg-title').textContent = f.title + period;
      el('map-source').textContent = `Source: ${f.source}. ${ethnicity ? 'Census counts.' : 'Figures are ONS estimates.'}`;
      el('table-caption').textContent = `${f.title}${period}. Source: ${f.source}.`;
      el('value-heading').textContent = ethnicity ? state.c === 'change' ? 'Change in percentage points' : 'Share of residents' : 'Change since 2011';
      el('population-controls').hidden = ethnicity;
      el('ethnicity-controls').hidden = !ethnicity;
      el('composition').hidden = !ethnicity;
      el('map-panel').setAttribute('aria-labelledby', `tab-${state.m}`);
      root.querySelectorAll('[data-measure]').forEach(t => {
        const active = t.dataset.measure === state.m;
        t.setAttribute('aria-selected', String(active)); t.tabIndex = active ? 0 : -1;
      });
      root.querySelectorAll('[data-census]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.census === state.c)));
      el('map-year').value = String(state.y); el('year-label').textContent = String(state.y);
      el('map-year').setAttribute('aria-valuetext', `Mid-${state.y}, ONS estimate`);
      el('map-view').value = state.v; el('map-group').value = state.g; el('composition-area').value = String(state.a);
      if (ethnicity) bars(data.bars);
      legend(f.scale);
      if (save) writeHash();
      if (announce && !timer) pause();
    } catch (error) {
      pause(false); el('map-status').textContent = `${error.message} The last complete map and table remain available. Try the control again.`;
    } finally { if (version === revision) root.removeAttribute('aria-busy'); }
  }
  function change(patch) { pause(false); Object.assign(state, patch); void render(); }
  root.querySelectorAll('[data-measure]').forEach(tab => {
    tab.addEventListener('click', () => change({ m: tab.dataset.measure }));
    tab.addEventListener('keydown', e => {
      const tabs = [...root.querySelectorAll('[data-measure]')];
      let next;
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs.at(-1);
      if (['ArrowLeft', 'ArrowRight'].includes(e.key)) next = tabs[1 - tabs.indexOf(tab)];
      if (next) { e.preventDefault(); next.focus(); change({ m: next.dataset.measure }); }
    });
  });
  el('map-year').addEventListener('input', e => change({ y: Number(e.target.value) }));
  el('map-view').addEventListener('change', e => change({ v: e.target.value }));
  el('map-group').addEventListener('change', e => change({ g: e.target.value }));
  el('composition-area').addEventListener('change', e => change({ a: Number(e.target.value) }));
  root.querySelectorAll('[data-census]').forEach(b => b.addEventListener('click', () => change({ c: b.dataset.census })));
  el('map-search').addEventListener('input', e => {
    pause(false);
    const index = names.findIndex(n => n.toLowerCase() === e.target.value.toLowerCase());
    if (index >= 0) { change({ a: index }); rows[index].scrollIntoView({ block: 'nearest' }); }
  });
  paths.forEach((p, i) => p.addEventListener('click', () => change({ a: i })));
  el('map-play').addEventListener('click', async () => {
    if (timer) { pause(); return; }
    if (reduced.matches || state.m !== 'population') return;
    const requested = revision;
    el('map-play').disabled = true;
    try { await load('population'); }
    catch (error) { el('map-status').textContent = error.message; return; }
    finally { el('map-play').disabled = false; }
    if (requested !== revision || state.m !== 'population' || reduced.matches || document.hidden) return;
    if (state.y === years.at(-1)) { state.y = years[0]; await render(); }
    el('map-status').textContent = '';
    el('map-play').textContent = 'Pause'; el('map-play').setAttribute('aria-pressed', 'true');
    timer = setInterval(async () => {
      if (document.hidden || reduced.matches) { pause(); return; }
      const i = years.indexOf(state.y);
      if (i === years.length - 1) { pause(); return; }
      state.y = years[i + 1]; await render(true, false);
      if (state.y === years.at(-1)) pause();
    }, 1200);
  });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  const motion = () => { pause(false); el('map-play').hidden = reduced.matches; };
  reduced.addEventListener('change', motion); motion();
  window.addEventListener('hashchange', () => { pause(false); readHash(); void render(false); });
  el('map-controls').hidden = false;
  if (location.hash) { readHash(); void render(false); }
}
