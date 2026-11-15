/* LAUNCH RADAR — the page logic. Static data from data.js (window.RADAR), no network anywhere. */
(() => {
  const R = window.RADAR;
  const $ = (sel) => document.querySelector(sel);
  const main = $('#main');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmtUSD = (n) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n}`;
  };
  const fmtPct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const gcls = (n) => (n === null || n === undefined ? '' : n >= 0 ? 'g-up' : 'g-down');
  const ageStr = (d) => (d === null ? 'age unknown' : d < 60 ? `${d}d old` : d < 730 ? `${Math.round(d / 30)}mo old` : `${(d / 365).toFixed(1)}y old`);

  const state = { view: 'board', sort: 'rank', dir: 1, q: '', chains: new Set(), cats: new Set(), minTVL: 0, slug: null };

  /* ---------- header ---------- */
  function renderStats() {
    const warm = R.rows.filter((r) => r.age_days !== null && r.age_days <= 180).length;
    $('#stats').innerHTML = [
      ['Protocols scanned', R.protocol_count],
      ['Pre-token rows', R.board_size],
      ['Watchlist', R.watchlist_size],
      ['Early finds', R.early_size],
      ['Top implied', fmtUSD(R.top_implied_usd), 'warm'],
    ].map(([k, v, w]) => `<div class="stat${w ? ' ' + w : ''}"><b>${v}</b><span>${k}</span></div>`).join('');
    $('#footmeta').textContent = `Snapshot ${R.as_of} · model ${R.model_version} · watchlist floor ${fmtUSD(R.floor_usd)} · ${R.board_size} protocols ranked`;
    $('#footsrc').textContent = R.source;
  }

  /* ---------- board view ---------- */
  function boardRows() {
    const q = state.q.trim().toLowerCase();
    let rows = R.rows;
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q) || (r.category || '').toLowerCase().includes(q) || r.chains.some((c) => c.toLowerCase().includes(q)));
    const key = state.sort;
    rows = [...rows].sort((a, b) => {
      let va = a[key], vb = b[key];
      if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      if (key === 'age_days') { va = a.age_days ?? -1; vb = b.age_days ?? -1; }
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.dir;
    });
    return rows;
  }

  const medal = ['🥇', '🥈', '🥉'];

  function renderBoard() {
    const rows = boardRows();
    const top = R.rows.slice(0, 3);
    const heroes = top.map((r, i) => `
      <div class="hero ${['gold', 'silver', 'bronze'][i]}" data-slug="${r.slug}">
        <div class="medal">${medal[i]}</div>
        <h3>${esc(r.name)}</h3>
        <div class="hmeta">rank #${r.rank} · ${esc(r.category || 'uncategorized')} · ${esc(r.chains.slice(0, 3).join(', '))}</div>
        <div class="hv">${fmtUSD(r.implied_value_usd)}</div>
        <div class="hmeta">implied launch value · TVL ${fmtUSD(r.tvl_usd)} · ${ageStr(r.age_days)} with no token</div>
      </div>`).join('');

    const arrow = (k) => (state.sort === k ? `<span class="arrow">${state.dir > 0 ? '▲' : '▼'}</span>` : '');
    const body = rows.slice(0, 120).map((r) => {
      const maxImplied = R.rows[0].implied_value_usd;
      return `<tr data-slug="${r.slug}">
        <td class="rank ${r.rank <= 3 ? 'top3' : ''}">#${r.rank}</td>
        <td><span class="pname">${esc(r.name)}</span> <span class="pslug">${esc(r.slug)}</span><br>
          <span class="pill ${r.on_watchlist ? 'watch' : 'early'}">${r.on_watchlist ? '★ WATCHLIST' : 'EARLY FIND'}</span>
          ${r.category ? `<span class="pill cat">${esc(r.category)}</span>` : ''}</td>
        <td class="chains">${esc(r.chains.slice(0, 3).join(' · '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
        <td class="num tvl">${fmtUSD(r.tvl_usd)}</td>
        <td class="num ${gcls(r.change_7d)}">${fmtPct(r.change_7d)}</td>
        <td class="num">${ageStr(r.age_days)}</td>
        <td><div class="num implied">${fmtUSD(r.implied_value_usd)}</div><div class="meter"><i style="width:${Math.max(2, Math.sqrt(r.implied_value_usd / maxImplied) * 100).toFixed(1)}%"></i></div></td>
      </tr>`;
    }).join('');

    main.innerHTML = `
      <div class="heroes">${heroes}</div>
      <div class="boardwrap"><table class="board">
        <thead><tr>
          <th data-k="rank">${arrow('rank')}RANK</th>
          <th data-k="name">${arrow('name')}PROTOCOL</th>
          <th>CHAINS</th>
          <th data-k="tvl_usd" style="text-align:right">${arrow('tvl_usd')}TVL</th>
          <th data-k="change_7d" style="text-align:right">${arrow('change_7d')}7D</th>
          <th data-k="age_days">${arrow('age_days')}NO-TOKEN AGE</th>
          <th data-k="implied_value_usd" style="text-align:right">${arrow('implied_value_usd')}IMPLIED VALUE</th>
        </tr></thead>
        <tbody>${body}</tbody></table>
        <div class="empty" style="padding:14px">showing ${Math.min(120, rows.length)} of ${rows.length} rows — search or sort to narrow</div>
      </div>`;
    main.querySelectorAll('[data-slug]').forEach((el) => el.addEventListener('click', () => go('detail', el.dataset.slug)));
    main.querySelectorAll('th[data-k]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
      renderBoard();
    }));
  }

  /* ---------- filter (radar scan) view ---------- */
  function renderScanControls() {
    const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
    const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
    const topChains = chains.slice(0, 9);
    const topCats = cats.slice(0, 9);
    return `
      <div class="scanhead">
        <span style="color:var(--faint);font-size:11px;letter-spacing:.1em">CHAIN</span>
        ${topChains.map((c) => `<button class="chip${state.chains.has(c) ? ' on' : ''}" data-chain="${esc(c)}">${esc(c)}</button>`).join('')}
        <span style="color:var(--faint);font-size:11px;letter-spacing:.1em">CATEGORY</span>
        <select id="catsel"><option value="">all categories</option>${cats.map((c) => `<option${state.cats.has(c) ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <span style="color:var(--faint);font-size:11px;letter-spacing:.1em">MIN TVL</span>
        <select id="tvlsel">
          ${[0, 10e6, 50e6, 100e6, 500e6].map((v) => `<option value="${v}"${state.minTVL === v ? ' selected' : ''}>${v === 0 ? 'any' : fmtUSD(v)}+</option>`).join('')}
        </select>
        <button class="chip" id="clearbtn">clear filters</button>
      </div>`;
  }

  function scanRows() {
    let rows = R.rows;
    if (state.chains.size) rows = rows.filter((r) => r.chains.some((c) => state.chains.has(c)));
    if (state.cats.size) rows = rows.filter((r) => state.cats.has(r.category));
    if (state.minTVL) rows = rows.filter((r) => r.tvl_usd >= state.minTVL);
    const q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.includes(q));
    return rows;
  }

  function renderScan() {
    const rows = scanRows();
    main.innerHTML = `
      ${renderScanControls()}
      ${rows.length === 0 ? '<div class="empty">no protocol matches these filters</div>' : `
      <div class="scangrid">
        ${rows.slice(0, 96).map((r) => `
          <div class="card" data-slug="${r.slug}">
            <h4>${esc(r.name)} <span class="pslug">#${r.rank}</span></h4>
            <span class="pill ${r.on_watchlist ? 'watch' : 'early'}">${r.on_watchlist ? '★ WATCHLIST' : 'EARLY FIND'}</span>
            <div class="cv">${fmtUSD(r.implied_value_usd)}</div>
            <div class="cmeta">TVL ${fmtUSD(r.tvl_usd)} · 7d ${fmtPct(r.change_7d)}<br>${esc(r.category || 'uncategorized')} on ${esc(r.chains.slice(0, 3).join(', '))}<br>comp ×${r.comp_multiple} (${esc(r.comp_source)}) · ${ageStr(r.age_days)}</div>
          </div>`).join('')}
      </div>
      <div class="empty" style="padding:14px">${rows.length} protocols match · showing 96</div>`}`;
    main.querySelectorAll('[data-slug]').forEach((el) => el.addEventListener('click', () => go('detail', el.dataset.slug)));
    main.querySelectorAll('[data-chain]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.chain;
      state.chains.has(c) ? state.chains.delete(c) : state.chains.add(c);
      renderScan();
    }));
    $('#catsel').addEventListener('change', (e) => { state.cats = e.target.value ? new Set([e.target.value]) : new Set(); renderScan(); });
    $('#tvlsel').addEventListener('change', (e) => { state.minTVL = Number(e.target.value); renderScan(); });
    $('#clearbtn').addEventListener('click', () => { state.chains = new Set(); state.cats = new Set(); state.minTVL = 0; state.q = ''; $('#search').value = ''; renderScan(); });
  }

  /* ---------- detail view ---------- */
  function farmStepsFor(slug) {
    const row = R.rows.find((r) => r.slug === slug);
    return row ? row.farm_steps : null;
  }

  function renderDetail(slug) {
    const r = R.rows.find((x) => x.slug === slug);
    if (!r) { main.innerHTML = '<div class="notFound">protocol not found — <span class="crumbs" id="back">← back to the board</span></div>'; $('#back').onclick = () => go('board'); return; }
    const comps = (R.comps[slug] || []).slice(0, 5);
    const steps = farmStepsFor(slug) || [];
    main.innerHTML = `
      <div class="crumbs" id="back">← back to the board</div>
      <div class="detail">
        <div>
          <div class="panel">
            <h2>${esc(r.name)} <span class="pill ${r.on_watchlist ? 'watch' : 'early'}">${r.on_watchlist ? '★ ON THE WATCHLIST' : 'EARLY FIND — below the watchlist floor'}</span></h2>
            <div class="bignum">${fmtUSD(r.implied_value_usd)}</div>
            <div style="color:var(--dim);font-size:12px">implied launch value · rank #${r.rank} of ${R.board_size}</div>
            <dl class="kv">
              <dt>TVL</dt><dd>${fmtUSD(r.tvl_usd)}</dd>
              <dt>7-day change</dt><dd class="${gcls(r.change_7d)}">${fmtPct(r.change_7d)}</dd>
              <dt>Category</dt><dd>${esc(r.category || '—')}</dd>
              <dt>Chains</dt><dd>${esc(r.chains.join(', ')) || '—'}</dd>
              <dt>Tracked since</dt><dd>${esc(r.listed_at || 'unknown')}</dd>
              <dt>No-token age</dt><dd>${ageStr(r.age_days)}</dd>
              <dt>Token status</dt><dd>records no token (no symbol, no CoinGecko id, no market cap)</dd>
              <dt>Watchlist</dt><dd>${r.on_watchlist ? 'yes — above the floor, on the no-token list' : 'no — below the floor, an early find'}</dd>
            </dl>
          </div>
          <div class="panel">
            <h3>How to farm ${esc(r.name)}</h3>
            <ol class="steps">${steps.map((s) => `<li>${esc(s)}<span class="stepcost"></span></li>`).join('')}</ol>
            <p style="color:var(--faint);font-size:11px;margin:10px 0 0">Steps are generated from the protocol's own record — category, chains, TVL and age — not a hand-written list. Nothing here predicts that a token comes.</p>
          </div>
        </div>
        <div>
          <div class="panel">
            <h3>The value model on this row</h3>
            <dl class="kv">
              <dt>Comp multiple</dt><dd>×${r.comp_multiple} · ${esc(r.comp_source)}</dd>
              <dt>Base value</dt><dd>${fmtUSD(Math.round(r.tvl_usd * r.comp_multiple))} = TVL × comp</dd>
              <dt>Growth ×</dt><dd>×${r.growth_multiplier} (7d ${fmtPct(r.change_7d)}, clamped ${R.model.growth_floor}..${R.model.growth_cap}%)</dd>
              <dt>Longevity ×</dt><dd>×${r.longevity_multiplier} (${ageStr(r.age_days)})</dd>
              <dt>Implied</dt><dd>${fmtUSD(r.implied_value_usd)}</dd>
            </dl>
            <p style="color:var(--faint);font-size:11px">implied = TVL × comp multiple × growth × longevity, where the comp multiple is the median market-cap/TVL of live-token protocols in the same category — the market's own pricing of that kind of business.</p>
          </div>
          <div class="panel">
            <h3>Live comps (${esc(r.comp_source)})</h3>
            <table class="comps"><tbody>
              ${comps.map((c) => `<tr><td>${esc(c.name)}</td><td class="pslug">${esc(c.symbol || '')}</td><td class="num tvl">${fmtUSD(c.tvl_usd)} TVL</td><td class="num tvl">${c.mcap_usd ? fmtUSD(c.mcap_usd) + ' mcap' : ''}</td><td class="num implied">×${c.ratio}</td></tr>`).join('') || '<tr><td class="empty">no live comps recorded in this category</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </div>`;
    $('#back').onclick = () => go(state.q || state.chains.size ? 'filter' : 'board');
  }

  /* ---------- method view ---------- */
  function renderMethod() {
    const m = R.model;
    const catRows = Object.entries(compTable()).slice(0, 14);
    main.innerHTML = `
      <div class="method panel">
        <h3>The model</h3>
        <div class="formula">
          comp multiple&nbsp;&nbsp;= median(mcap / TVL) of live-token protocols in the same category&nbsp;&nbsp;<span style="color:var(--faint)">${esc(R.model_version)}</span><br>
          base value&nbsp;&nbsp;&nbsp;&nbsp;= TVL × comp multiple<br>
          growth ×&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= 1 + clamp(7d change, ${m.growth_floor}..${m.growth_cap}%)/100 × ${m.growth_weight}<br>
          longevity ×&nbsp;&nbsp;&nbsp;= ${m.longevity_floor} + min(age, ${m.longevity_days}d)/${m.longevity_days}d × ${m.longevity_range}<br>
          implied value&nbsp;&nbsp;= max(1, round(base × growth × longevity))
        </div>
        <p>Every protocol the snapshot carries is scored by this one function: no name is special-cased, no hardcoded list ranks anything. The comp multiple is learned from the snapshot itself — it is the market's own median market-cap-to-TVL pricing for that category of protocol, so a ${fmtUSD(1e8)} TVL lending protocol is valued the way the market already prices lending protocols, not by a flat guess.</p>
        <p>Protocols whose token already trades never appear on the board: they are the comp set the board is priced against. The watchlist (${R.watchlist_size} protocols at or above the ${fmtUSD(R.floor_usd)} floor that record no token and are not wrapped, staked or bridged products of a trading token) is the floor, never the ceiling — the other ${R.early_size} rows are the early finds below it that a TVL table would never show you.</p>
        <h3>Category comp multiples, from the snapshot's live tokens</h3>
        <table class="comps"><tbody>
          ${catRows.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num implied">×${v.toFixed(2)}</td></tr>`).join('')}
        </tbody></table>
        <p style="font-size:11px;color:var(--faint)">Snapshot ${esc(R.source)}. Implied value is a model's claim for comparison, not a prediction that any token is issued.</p>
      </div>`;
  }

  function compTable() {
    // Recompute the category medians from the live comp data for the method page.
    const byCat = {};
    for (const l of R.live) {
      if (l.category === null || !l.ratio) continue;
      (byCat[l.category] = byCat[l.category] || []).push(l.ratio);
    }
    const out = {};
    for (const [c, list] of Object.entries(byCat)) {
      if (list.length < 3) continue;
      const s = [...list].sort((a, b) => a - b);
      out[c] = s[s.length >> 1];
    }
    return out;
  }

  /* ---------- routing ---------- */
  function go(view, slug, skipHash) {
    state.view = view;
    state.slug = slug || null;
    if (!skipHash) {
      const frag = view === 'detail' && state.slug ? `#/detail/${state.slug}` : view === 'board' ? '#/' : `#/${view}`;
      if (location.hash !== frag) history.replaceState(null, '', frag);
    }
    document.querySelectorAll('.viewbtn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'board') renderBoard();
    else if (view === 'filter') renderScan();
    else if (view === 'method') renderMethod();
    else if (view === 'detail') renderDetail(state.slug);
    window.scrollTo(0, 0);
  }

  function routeFromHash() {
    const h = location.hash;
    const dm = h.match(/^#\/detail\/([a-z0-9-]+)/i);
    if (dm) return go('detail', dm[1], true);
    const vm = h.match(/^#\/(filter|method|board)/);
    if (vm) return go(vm[1], undefined, true);
    go('board', undefined, true);
  }

  document.querySelectorAll('.viewbtn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $('#search').addEventListener('input', (e) => {
    state.q = e.target.value;
    if (state.view === 'detail') go('board'); else go(state.view);
  });

  renderStats();
  routeFromHash();
})();
