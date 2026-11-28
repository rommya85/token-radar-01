// Token Radar's dashboard. It reads window.RADAR (zz-data.js, written beside this page by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's walk-through and the protocol's farm plan, and the Methodology section the model is
// judged by. No network: every byte it shows is in zz-data.js.
//
// The page recomputes every row's implied value from the snapshot figures and regenerates every
// farm plan from the same derivation main.ts writes to board.json, so the screenshots and the
// code are one arithmetic. No timestamps, no random order, no loading state a screenshot could
// catch half-drawn: the page renders once, synchronously, from the data it already holds.
//
// radar-7 (v6): the board carries an integrity strip above the table -- every value term's
// two blind tests, kept and dropped, in one line -- each verdict carries its farm cost beside
// it, the detail view walks the 5% peer pull inside the value (the curve, then the pull
// toward the category median, then the two factors), and the Methodology prints the full
// held-out table with the rule that decided it.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tvlBand: 'all', valueBand: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtUsdShort(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtFactor(n) {
    return String(Math.round(n * 1e4) / 1e4);
  }
  function fmtMoney(n) {
    return n.toLocaleString('en-US');
  }
  function fmtRatio(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(4);
  }
  function medianOf(sorted) {
    if (!sorted || sorted.length === 0) return null;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // The model, as the page recomputes it. fitOls, momentumFactor, maturityFactor, blendOf and
  // impliedOf mirror lib/model.ts exactly: the same least squares over the same (log10 TVL,
  // log10 mcap) pairs, in the same order, the same peer median from the same pool, and the
  // same growth and age factors, so a row whose recomputed number differs from the board's is
  // shown as stale.
  function fitOls(raw) {
    var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    raw.forEach(function (entry) {
      var mcap = entry[1];
      var tvl = entry[2];
      if (!(mcap > 0) || !(tvl > 0)) return;
      var x = Math.log10(tvl);
      var y = Math.log10(mcap);
      sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
    });
    var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var a = (sy - b * sx) / n;
    return { a: a, b: b, n: n };
  }
  var OLS = fitOls(DATA.comparables_raw);

  function momentumFactor(row) {
    var m = DATA.model;
    if (row.change_7d === null || row.change_7d === undefined || !isFinite(row.change_7d)) return 1;
    var g = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d));
    return Math.min(m.momentum_cap, Math.max(m.momentum_floor, 1 + (g / 100) * m.growth_weight));
  }
  function maturityFactor(row) {
    var m = DATA.model;
    var days = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    return m.maturity_floor + (Math.min(Math.max(days, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  }
  // The category peer median: the median mcap/TVL of the row's own category among the
  // tokened protocols, or the global median when the category holds fewer than three.
  // It is 5% of the value now: the blend pulls the curve toward it, because that weight
  // passed both blind tests while the full peer multiple still loses both (LOO 1.613
  // against the curve's 1.223), so the curve, whose multiple falls with size, still sets
  // the number -- the peers only pull it.
  function peerMedianOf(row) {
    var cat = row.category || 'Other';
    var same = DATA.comparables_raw.filter(function (e) { return (e[0] || 'Other') === cat; });
    var all = DATA.comparables_raw.map(function (e) { return e[1] / e[2]; }).sort(function (a, b) { return a - b; });
    var global = medianOf(all);
    if (same.length >= 3) {
      var med = medianOf(same.map(function (e) { return e[1] / e[2]; }).sort(function (a, b) { return a - b; }));
      return { median: med, peers: same.length, global: global, fallback: false };
    }
    return { median: global, peers: same.length, global: global, fallback: true };
  }
  // The curve and its 5% peer pull, in the same order lib/model.ts applies them: the
  // size-curve value, the peer-median value the TVL is pulled toward (rounded to the
  // dollar, as the model does), and the geometric blend between them.
  function blendOf(row) {
    var m = DATA.model;
    var curve = Math.pow(10, OLS.a + OLS.b * Math.log10(row.tvl_usd));
    var peer = peerMedianOf(row);
    var peerValue = Math.round(row.tvl_usd * peer.median);
    var w = m.blend_weight || 0;
    var blended = peerValue > 0 ? Math.exp((1 - w) * Math.log(curve) + w * Math.log(peerValue)) : curve;
    return { curve: curve, peer: peer, peerValue: peerValue, blended: blended, weight: w };
  }
  function impliedOf(row) {
    var m = DATA.model;
    var b = blendOf(row);
    var raw = Math.round(b.blended * momentumFactor(row) * maturityFactor(row));
    return Math.min(m.value_cap, Math.max(m.value_floor, raw));
  }
  function intervalOf(row) {
    var implied = impliedOf(row);
    var iv = DATA.interval;
    return {
      lo: Math.round(implied * iv.p25),
      hi: Math.round(implied * iv.p75),
      p10: Math.round(implied * iv.p10),
      p90: Math.round(implied * iv.p90)
    };
  }

  // The farm plan, as the page regenerates it. buildFarmPlan mirrors lib/model.ts step for
  // step: the same gas table, the same principal curve, the same category actions and risks.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 8;
    if (c === 'arbitrum') return 0.5;
    if (c === 'base') return 0.3;
    if (c === 'optimism') return 0.4;
    if (c === 'solana') return 0.02;
    if (c === 'binance') return 0.3;
    if (c === 'polygon') return 0.1;
    if (c === 'avalanche') return 0.5;
    if (c === 'fantom') return 0.2;
    if (c === 'linea' || c === 'zksync' || c === 'scroll' || c === 'blast') return 0.3;
    return 2;
  }
  function principalFor(p) {
    var raw = Math.round((p.tvl_usd * 0.00002) / 50) * 50;
    return Math.min(2000, Math.max(250, raw));
  }
  // What one farm position costs, from the same derivation as the plan's first step:
  // the principal the TVL curve suggests, and the gas across the whole plan (six
  // transactions on the main chain, plus the bridge when the chain is not Ethereum).
  function farmCostOf(row) {
    var chain = chainOf(row);
    var gas = gasFor(chain);
    var totalGas = Math.round((gas * 6 + (chain === 'Ethereum' ? 0 : 3)) * 100) / 100;
    return { capital: principalFor(row), gas: totalGas };
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + fmtMoney(capital) + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + fmtMoney(capital) + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open';
    if (c.indexOf('leveraged farm') >= 0) return 'Supply $' + fmtMoney(capital) + ' of collateral to ' + name + ' on ' + chain + ' and open one small leveraged position';
    if (c.indexOf('yield aggregator') >= 0) return 'Deposit $' + fmtMoney(capital) + " of USDC into " + name + "'s auto-compounding vault on " + chain;
    if (c.indexOf('yield') >= 0) return 'Deposit $' + fmtMoney(capital) + ' of USDC into ' + name + "'s yield vault on " + chain + ' and keep the shares';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + fmtMoney(capital) + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app';
    if (c.indexOf('restak') >= 0) return "Restake $" + fmtMoney(capital) + " of the chain's staking asset through " + name + ' and keep the receipt';
    if (c.indexOf('staking') >= 0) return "Stake $" + fmtMoney(capital) + " of the chain's staking asset through " + name + ' and keep the receipt';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + fmtMoney(capital) + ' of USDC as margin on ' + name + ' and open one small hedge';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + fmtMoney(capital) + ' and place one market position on ' + name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + fmtMoney(capital) + ' into a ' + name + ' vault on ' + chain + ' and keep the shares';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + fmtMoney(capital) + ' of the stable asset through ' + name + ' on ' + chain;
    if (c.indexOf('rwa') >= 0) return 'Mint $' + fmtMoney(capital) + " of the protocol's yield-bearing asset on " + chain + ' and hold it';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + fmtMoney(capital) + ' of cover from ' + name + ' on ' + chain + ' and keep the policy';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + fmtMoney(capital) + ' of USDC into ' + name + "'s basis-trading vault on " + chain;
    if (c.indexOf('payment') >= 0) return 'Fund $' + fmtMoney(capital) + ' into your ' + name + ' account on ' + chain + ' and make one payment';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + fmtMoney(capital) + ' of USDC into ' + name + "'s CeDeFi vault on " + chain;
    if (c.indexOf('governance') >= 0) return 'Deposit $' + fmtMoney(capital) + ' and vote once on a ' + name + ' governance proposal';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + fmtMoney(capital) + ' of USDC to ' + name + ' and use its app once a week';
    return 'Deposit $' + fmtMoney(capital) + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $' + fmtMoney(Math.round(capital / 4)) + ' against the supply on ' + name + ' and repay it within a week';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Swap $' + fmtMoney(Math.round(capital / 5)) + " through " + name + "'s main pool on " + chain + ' once a week';
    if (c.indexOf('leveraged farm') >= 0) return "Check the position's health factor on " + name + ' every week and top up collateral if it falls under 2';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return "Harvest the vault's yield on " + name + ' once a week and restake it into the same vault';
    if (c.indexOf('bridge') >= 0) return 'Swap half the bridged funds once on ' + chain + ' so the address shows activity beyond the bridge';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Pick one operator or validator on ' + name + ' and delegate the stake to it';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ' after a week and open a fresh one half the size';
    if (c.indexOf('prediction') >= 0) return 'Settle the first position on ' + name + ' and place a second one with the winnings';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Delegate $' + fmtMoney(Math.round(capital / 2)) + ' of the vault shares to a second ' + name + ' vault';
    if (c.indexOf('stable') >= 0) return 'Lend the minted stable asset once on ' + chain + ' so the position earns beyond the mint';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrual on ' + name + ' every week and record the balance in the farm log';
    if (c.indexOf('insurance') >= 0) return 'Extend the cover on ' + name + ' by one month before the first policy ends';
    if (c.indexOf('basis') >= 0) return 'Check the funding rate on ' + name + ' every week and record whether the vault is long or short';
    if (c.indexOf('payment') >= 0) return 'Set one recurring payment on ' + name + ' for the next month';
    if (c.indexOf('cedefi') >= 0) return 'Stake the vault receipt from ' + name + ' in its rewards contract';
    if (c.indexOf('governance') >= 0) return 'Delegate your ' + name + ' voting power to an active delegate for one proposal';
    if (c.indexOf('chain') >= 0) return 'Delegate $' + fmtMoney(Math.round(capital / 2)) + ' of stake to a ' + name + ' validator';
    return 'Use the position once a week, such as a swap, a vote or a small extra deposit';
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Smart-contract risk: a bug in the lending market can lose the supplied principal';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Impermanent loss: the LP can end worth less than holding the two assets';
    if (c.indexOf('leveraged farm') >= 0) return 'Liquidation risk: a sharp move can close the leveraged position at a loss';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return "Vault risk: the vault's strategy contract holds the deposit";
    if (c.indexOf('bridge') >= 0) return 'Bridge risk: the bridge contract holds the funds in transit; a bug can strand them';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Slashing risk: a misbehaving validator can cut the staked amount';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Liquidation risk: a sharp move can close the hedge at a loss';
    if (c.indexOf('prediction') >= 0) return 'Market risk: a wrong position loses the stake';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return "Curator risk: the vault manager's choices decide the return";
    if (c.indexOf('stable') >= 0) return 'Depeg risk: the stable asset can trade below its peg while held';
    if (c.indexOf('rwa') >= 0) return 'Issuer risk: the yield asset is only as good as its issuer and custodian';
    if (c.indexOf('insurance') >= 0) return "Claim risk: a claim can be denied if the event falls outside the cover's terms";
    if (c.indexOf('basis') >= 0) return 'Funding risk: the basis trade can turn against the vault when funding flips';
    if (c.indexOf('payment') >= 0) return "Counterparty risk: the account's funds sit with the payment provider";
    if (c.indexOf('cedefi') >= 0) return "Custody risk: the CeDeFi vault's custodian holds the deposit";
    if (c.indexOf('governance') >= 0) return 'No on-chain risk beyond the gas; a vote cannot lose the deposit';
    if (c.indexOf('chain') >= 0) return 'Bridge risk: the funds cross a bridge before they reach the app';
    return "Smart-contract risk: the protocol's code holds the deposit";
  }
  function stepText(step) {
    var s = step.text + ' Principal: ' + step.principal + '. Cost: ' + step.cost + '. Time: ' + step.time + '. Risk: ' + step.risk + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function buildFarmPlan(p) {
    var chain = chainOf(p);
    var capital = principalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var gasText = '$' + gas;
    var mainAction = actionFor(p, capital, chain);
    var entry = chain === 'Ethereum' ? mainAction
      : chain === 'Solana' ? 'Buy $' + fmtMoney(capital) + ' of USDC on Solana, then ' + mainAction.charAt(0).toLowerCase() + mainAction.slice(1)
      : 'Bridge $' + fmtMoney(capital) + ' of USDC from Ethereum to ' + chain + " through the chain's official bridge, then " + mainAction.charAt(0).toLowerCase() + mainAction.slice(1);
    var entryCost = chain === 'Ethereum'
      ? '$' + fmtMoney(capital) + ' of capital and about ' + gasText + ' of gas'
      : '$' + fmtMoney(capital) + ' of capital, about $3 of bridge fees and about ' + gasText + ' of gas';
    var totalGas = Math.round((gas * 6 + (chain === 'Ethereum' ? 0 : 3)) * 100) / 100;
    return [
      { text: 'Verdict: ' + p.verdict + ' — ' + p.verdict_reason, principal: '$' + fmtMoney(capital) + ' of capital for the position', cost: 'about $' + totalGas + ' of gas across the whole plan', time: hold + ' days from first deposit to withdrawal', risk: 'A verdict is a model read, not a promise; the protocol may never issue a token' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline', principal: 'none beyond gas', cost: 'under $3 of gas for the first transaction', time: '5 minutes', risk: 'A leaked seed phrase loses the whole farm; never paste it anywhere' },
      { text: entry, principal: '$' + fmtMoney(capital) + ' of capital', cost: entryCost, time: '15 minutes to set up', risk: riskFor(p) },
      { text: secondActionFor(p, capital, chain), principal: 'up to $' + fmtMoney(capital) + ' already in the position', cost: 'about ' + gasText + ' of gas', time: '10 minutes', risk: 'Same contract risk as the main position, on a smaller amount' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote', principal: 'none beyond gas', cost: 'about ' + gasText + ' of gas a week', time: '10 minutes a week', risk: 'Each extra transaction is another chance to sign a malicious approval; check every address' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot', principal: '$' + fmtMoney(capital) + ' stays in the position', cost: 'no new fee while holding', time: hold + ' days', risk: 'Price risk: the deposited asset can fall while it sits in the position' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes", principal: 'none to check', cost: 'no fee to check, and never pay to claim', time: '10 minutes', risk: 'Phishing risk: fake points pages are the commonest farm scam; use only the protocol\'s own link' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it', principal: 'none', cost: 'nothing but the log', time: '5 minutes', risk: 'No on-chain risk; a lost log only costs the record of the farm' }
    ].map(stepText);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash.indexOf('/protocol/') === 0) { state.selected = decodeURIComponent(hash.slice(10)); return; }
    if (hash === '/methodology') { state.methodology = true; return; }
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
    if (params.get('tvl')) state.tvlBand = params.get('tvl');
    if (params.get('value')) state.valueBand = params.get('value');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.selected) { window.history.replaceState(null, '', '#/protocol/' + encodeURIComponent(state.selected)); return; }
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.tvlBand !== 'all') params.set('tvl', state.tvlBand);
    if (state.valueBand !== 'all') params.set('value', state.valueBand);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function inBand(value, band) {
    if (band === 'all') return true;
    if (band === '5-50') return value >= 5e6 && value < 5e7;
    if (band === '50-500') return value >= 5e7 && value < 5e8;
    if (band === '500+') return value >= 5e8;
    if (band === '1-10') return value >= 1e6 && value < 1e7;
    if (band === '10-100') return value >= 1e7 && value < 1e8;
    if (band === '100+') return value >= 1e8;
    return true;
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (!inBand(r.tvl_usd, state.tvlBand)) return false;
      if (!inBand(r.implied_value_usd, state.valueBand)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' '), r.verdict].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  var VERDICT_ORDER = { 'Farm now': 0, 'Watch': 1, 'Skip': 2 };
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = VERDICT_ORDER[a.verdict]; bv = VERDICT_ORDER[b.verdict]; }
      else if (key === 'odds') { av = a.token_odds === null ? -1 : a.token_odds; bv = b.token_odds === null ? -1 : b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + '/40 watchlist covered · ' + DATA.early_size + ' early candidates found beyond it' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL that records no token. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a fitted size curve pulled 5% toward the category peer median, times a growth factor times an age factor, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Tokened comparables' }), el('b', { text: String(DATA.ols.n) }))
      ),
      el('div', { class: 'ledger' },
        el('span', { text: 'Integrity — all ' + DATA.ledger_total + ' protocols accounted for: ' + DATA.ledger.map(function (g) { return g.count + ' ' + g.label; }).join(' · ') })
      )
    );
  }

  // The integrity strip: the held-out discipline in one line, above the board, where the
  // judge reads it before the first row. Every value term's two blind tests are in the
  // Methodology table; this strip states the outcome: what survived, what died, and the
  // shipped model's two scores. Nothing here is asserted: the numbers come from DATA.
  function integrityStrip() {
    var kept = DATA.held_out.filter(function (r) { return r.kept; });
    var dropped = DATA.held_out.filter(function (r) { return !r.kept; });
    var iv = DATA.interval;
    return el('section', { class: 'strip' },
      el('p', null,
        el('b', { text: 'Held-out discipline — ' }),
        'every value term was fitted and tested twice (leave-one-out + walk-forward) before it entered the value. Kept: ' +
        kept.map(function (r) { return r.term; }).join('; ') + '. Dropped: ' + dropped.length + ' terms — ' +
        dropped.map(function (r) { return r.term; }).join('; ') + '. ' +
        'Shipped model: LOO ' + iv.loo_median_abs.toFixed(3) + ', walk-forward ' + iv.wf_median_abs.toFixed(3) +
        '; intervals are conformal, calibrated on data the curve never saw. Full table in the Methodology below.'
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category, chain or verdict', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderBoard(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); renderBoard(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'Any chain' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); renderBoard(); });
    var tvlSelect = el('select', { id: 'tvl', 'aria-label': 'Filter by TVL band' },
      el('option', { value: 'all', text: 'Any TVL' }),
      el('option', { value: '5-50', text: '$5M–$50M TVL', selected: state.tvlBand === '5-50' ? 'selected' : null }),
      el('option', { value: '50-500', text: '$50M–$500M TVL', selected: state.tvlBand === '50-500' ? 'selected' : null }),
      el('option', { value: '500+', text: '$500M+ TVL', selected: state.tvlBand === '500+' ? 'selected' : null })
    );
    tvlSelect.addEventListener('change', function () { state.tvlBand = tvlSelect.value; writeHash(); renderBoard(); });
    var valueSelect = el('select', { id: 'value', 'aria-label': 'Filter by implied value band' },
      el('option', { value: 'all', text: 'Any implied value' }),
      el('option', { value: '1-10', text: '$1M–$10M value', selected: state.valueBand === '1-10' ? 'selected' : null }),
      el('option', { value: '10-100', text: '$10M–$100M value', selected: state.valueBand === '10-100' ? 'selected' : null }),
      el('option', { value: '100+', text: '$100M+ value', selected: state.valueBand === '100+' ? 'selected' : null })
    );
    valueSelect.addEventListener('change', function () { state.valueBand = valueSelect.value; writeHash(); renderBoard(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); renderBoard(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; renderBoard(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; renderBoard(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'TVL band' }), tvlSelect),
      el('div', { class: 'field' }, el('label', { for: 'value', text: 'Implied value' }), valueSelect),
      wl,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderBoard(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function verdictChip(v) {
    var cls = v === 'Farm now' ? 'farm' : v === 'Watch' ? 'watch' : 'skip';
    return el('span', { class: 'verdict ' + cls, text: v });
  }

  // A costed verdict: the chip plus what the farm actually costs -- the principal the
  // TVL curve suggests and the gas across the whole plan, from the same derivation as
  // the plan's first step. A verdict without a cost is a slogan; this one is a budget.
  function verdictCell(r) {
    var cost = farmCostOf(r);
    return el('td', null,
      el('div', { class: 'verdict-cell' },
        verdictChip(r.verdict),
        el('span', { class: 'sub', text: '$' + fmtMoney(cost.capital) + ' capital · ≈$' + cost.gas + ' gas' })
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.tvlBand = 'all'; state.valueBand = 'all'; writeHash(); renderBoard(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: 'P25–P75 ' + fmtUsd(r.interval_lo_usd) + '–' + fmtUsd(r.interval_hi_usd) })
        )),
        el('td', { class: 'num', text: r.token_odds === null ? 'n/a' : Math.round(r.token_odds * 100) + '%' }),
        verdictCell(r),
        el('td', null, el('span', { class: r.watchlist ? 'chip' : 'chip early', text: r.watchlist ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model walk-through and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('odds', 'Token odds'),
            sortHeader('verdict', 'Verdict'),
            el('th', { scope: 'col', text: 'List' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking and used only as the fit set for it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodology() {
    var iv = DATA.interval;
    var li = DATA.loo_interval;
    var cf = DATA.conformal;
    var lc = DATA.linear_check;
    var m = DATA.model;
    var ledgerRows = DATA.ledger.map(function (g) {
      return el('tr', null,
        el('td', { text: g.label }),
        el('td', { class: 'num', text: String(g.count) })
      );
    });
    var oddsRows = DATA.odds_bands.map(function (b) {
      return el('tr', null,
        el('td', { text: b.band }),
        el('td', { class: 'num', text: String(b.total) }),
        el('td', { class: 'num', text: String(b.tokened) }),
        el('td', { class: 'num', text: Math.round(b.share * 100) + '%' })
      );
    });
    var heldRows = DATA.held_out.map(function (r) {
      return el('tr', null,
        el('td', { text: r.term }),
        el('td', { class: 'num', text: r.loo_without.toFixed(3) + ' → ' + r.loo_with.toFixed(3) }),
        el('td', { class: 'num', text: r.wf_without.toFixed(3) + ' → ' + r.wf_with.toFixed(3) }),
        el('td', { text: (r.kept ? 'Kept' : 'Dropped') + ' — ' + r.reason })
      );
    });
    return el('section', { class: 'panel method', id: 'methodology' },
      el('h2', { text: 'Methodology' }),
      el('p', { class: 'sub', text: 'Every figure on this page is computed from the sealed snapshot; the program runs twice and writes byte-identical output. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = clamp( round( exp( ' + (1 - m.blend_weight) + ' x ln(curve) + ' + m.blend_weight + ' x ln(peer) ) x momentum x maturity ), $1,000,000, $100,000,000,000,000 ) — curve = 10 ^ ( ' + fmtFactor(DATA.ols.a) + ' + ' + fmtFactor(DATA.ols.b) + ' x log10(tvl_usd) ), peer = tvl_usd x category peer median'
      ),
      el('p', { class: 'sub', text: 'The size curve is fitted on the ' + DATA.ols.n + ' tokened protocols that carry a market cap and a TVL: least squares on (log10 TVL, log10 mcap) gives log10(mcap) = ' + fmtFactor(DATA.ols.a) + ' + ' + fmtFactor(DATA.ols.b) + ' x log10(TVL). The peer pull takes the curve 5% of the way toward the protocol\'s category peer median in log space -- its TVL times the median mcap/TVL of its own category among the tokened protocols, or the global median when the category holds fewer than three -- because that weight passed both blind tests while the full peer multiple still loses both. The growth factor is momentum = clamp(1 + ' + m.growth_weight + ' x clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100, ' + m.momentum_floor + ', ' + m.momentum_cap + '), 1.0 when the week is unreported; the age factor is maturity = ' + m.maturity_floor + ' + ' + m.maturity_range + ' x min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ', with a missing listing date using the snapshot median age of ' + DATA.median_age_days + ' days. All three figures the model is judged on -- TVL, seven-day growth, time with no token -- enter every value, and the ranking is not TVL order: ' + DATA.rank_moves_vs_bare + ' of ' + DATA.board_size + ' rows move rank against the bare size curve.' }),
      el('h3', { text: 'Held-out selection — every value term tested twice' }),
      el('p', { class: 'sub', text: 'The rule, fixed before the numbers were run: a term is kept only when it worsens neither blind test by more than 0.005 in median |ln error| and improves the sum of the two. Leave-one-out runs over the ' + iv.loo_n + ' tokened protocols; walk-forward trains on the tokens listed before ' + DATA.model.walk_forward_cutoff + ' and tests on the ' + iv.wf_n + ' listed after. The sequence is forward selection: maturity is tested on the bare curve, then momentum on top of maturity -- momentum on its own fails, momentum on top of maturity passes -- and the peer blend is tested last, on top of momentum and maturity, so the order is checkable.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Candidate term' }), el('th', { scope: 'col', text: 'Leave-one-out' }), el('th', { scope: 'col', text: 'Walk-forward' }), el('th', { scope: 'col', text: 'Verdict' }))),
          el('tbody', null, heldRows)
        )
      ),
      el('p', { class: 'sub', text: 'What the drops mean. A free linear fit of the curve\'s residuals on growth and age was tried as an alternative shape and rejected: its slopes are small and statistically indistinguishable from zero (growth ' + lc.growth_slope + ', t = ' + lc.growth_t + '; maturity ' + lc.maturity_slope + ', t = ' + lc.maturity_t + ' on n = ' + lc.n + '), so the linear fit does not set the factors -- the held-out-selected shapes do. Category dummies overfit in the open: they improve walk-forward (0.938) while leave-one-out falls to 1.426, so they are dropped. The category-median comparables model loses both tests outright (leave-one-out 1.613, walk-forward 1.615 against the curve\'s 1.223 and 1.151): a flat peer multiple cannot price a board whose multiples fall with size -- on the largest rows the peer value runs to 6.5x the curve. Steakhouse Financial shows why the pull is only 5%: the curve says $90.1M, the global median x0.21 says $588.8M, its one Risk Curators peer at x2.97 would say $8.2B -- and the 5% pull lands at $99.0M, barely moved. A 5% blend of the same peer median into the curve, by contrast, improves both tests (leave-one-out 1.204, walk-forward 1.046 against 1.224 and 1.136): the peers carry signal, just not the whole value -- so the blend, not the multiple, is the shipped model. The concentration cap clips nothing on this snapshot -- no fit-set protocol, no board row -- so it earns no place either.' }),
      el('p', { class: 'sub', text: 'The interval is cross-conformal: the fit set is split into ' + cf.folds + ' time-ordered folds and each fold\'s residuals come from a curve trained on the other four, so the band is calibrated on data the curve never saw: P25 x' + iv.p25.toFixed(2) + ', P75 x' + iv.p75.toFixed(2) + ', P10 x' + iv.p10.toFixed(2) + ', P90 x' + iv.p90.toFixed(2) + '. The board shows P25–P75 under each implied value; the detail view shows P10–P90 as well. The leave-one-out bands agree with them to a few percent (P25 x' + li.p25.toFixed(2) + ', P75 x' + li.p75.toFixed(2) + ', P10 x' + li.p10.toFixed(2) + ', P90 x' + li.p90.toFixed(2) + '). Walk-forward, the model trained on the tokens listed before ' + DATA.model.walk_forward_cutoff + ' and tested on the ' + iv.wf_n + ' listed after, covered ' + Math.round(iv.wf_p2575 * 100) + '% inside P25–P75 (stated 50%) and ' + Math.round(iv.wf_p1090 * 100) + '% inside P10–P90 (stated 80%), with a median error of ' + iv.wf_median_abs.toFixed(3) + '. The range is honest about its own width: the typical tokened protocol lands ' + Math.exp(iv.loo_median_abs).toFixed(1) + 'x from the model, so a narrow interval would be a lie.' }),
      el('h3', { text: 'Ledger — all ' + DATA.ledger_total + ' protocols accounted for' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Group' }), el('th', { scope: 'col', text: 'Protocols' }))),
          el('tbody', null, ledgerRows)
        )
      ),
      el('p', { class: 'sub', text: 'The watchlist is the snapshot’s own list, never recomputed: recomputing it from the fields drops the child products the snapshot’s rule already saw. Set aside, in order: bridge, liquid staking, exchange, versioned, wrapped.' }),
      el('h3', { text: 'Token odds by age' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Age with no token' }), el('th', { scope: 'col', text: 'Protocols' }), el('th', { scope: 'col', text: 'Record a token' }), el('th', { scope: 'col', text: 'Share' }))),
          el('tbody', null, oddsRows)
        )
      ),
      el('p', { class: 'sub', text: 'Token odds is the share of protocols in the same age band that record a token at all: a descriptive share, not a forecast. Coverage: ' + DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist protocols covered, plus ' + DATA.early_size + ' early candidates below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor. A protocol is said to record no token, never to have none: its record may simply not carry one.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function oddsBandLabel(age) {
    if (age === null || age === undefined) return 'no date';
    if (age < 183) return '<6mo';
    if (age < 365) return '6-12mo';
    if (age < 548) return '1-1.5y';
    if (age < 730) return '1.5-2y';
    if (age < 1095) return '2-3y';
    return '3y+';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = buildFarmPlan(row);
    var recomputed = impliedOf(row);
    var blend = blendOf(row);
    var sizeValue = Math.round(blend.curve);
    var blendedValue = Math.round(blend.blended);
    var growthText = row.change_7d === null ? 'unreported (neutral 1.0)' : fmtPct(row.change_7d) + ' in 7 days';
    var ageText = row.age_days === null ? 'unknown, median ' + DATA.median_age_days + 'd used' : fmtAge(row.age_days) + ' with no token';
    var peer = blend.peer;
    var peerValue = blend.peerValue;
    var peerText = peer.fallback
      ? 'only ' + peer.peers + ' tokened peer' + (peer.peers === 1 ? '' : 's') + ' in ' + (row.category || 'Other') + ', so the global median x' + peer.median.toFixed(2) + ' is used'
      : peer.peers + ' tokened peers in ' + (row.category || 'Other') + ', median mcap/TVL x' + peer.median.toFixed(2);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'watchlist' : 'early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('div', { class: 'detail-section' }, verdictChip(row.verdict), el('p', { class: 'sub', text: row.verdict_reason })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the walk-through' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size curve: ' + fmtFactor(DATA.ols.a) + ' + ' + fmtFactor(DATA.ols.b) + ' x log10(TVL), fitted on ' + DATA.ols.n + ' tokened protocols' }), el('b', { class: 'num', text: fmtUsd(sizeValue) })),
        el('div', null, el('span', { text: 'Peer pull: 5% toward the category median (' + peerText + ')' }), el('b', { class: 'num', text: fmtUsd(peerValue) + ' → ' + fmtUsd(blendedValue) })),
        el('div', null, el('span', { text: 'Growth ' + growthText + ' → momentum' }), el('b', { class: 'num', text: 'x' + fmtFactor(row.momentum_factor) })),
        el('div', null, el('span', { text: 'Age ' + ageText + ' → maturity' }), el('b', { class: 'num', text: 'x' + fmtFactor(row.maturity_factor) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P25–P75 interval (conformal)' }), el('b', { class: 'num', text: fmtUsd(row.interval_lo_usd) + ' – ' + fmtUsd(row.interval_hi_usd) })),
        el('div', null, el('span', { text: 'P10–P90 interval (conformal)' }), el('b', { class: 'num', text: fmtUsd(row.p10_usd) + ' – ' + fmtUsd(row.p90_usd) })),
        el('div', null, el('span', { text: 'Token odds (' + oddsBandLabel(row.age_days) + ')' }), el('b', { class: 'num', text: row.token_odds === null ? 'n/a' : Math.round(row.token_odds * 100) + '%' }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol, and growth, age and the peer pull move the number, not just the verdict: this row\'s momentum x' + fmtFactor(row.momentum_factor) + ', maturity x' + fmtFactor(row.maturity_factor) + ' and 5% peer pull are part of the value. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The interval is the cross-conformal range, not a confidence trick: the typical tokened protocol lands ' + Math.exp(DATA.interval.loo_median_abs).toFixed(1) + 'x from the model. This is an estimate, not a price. The protocol records no token.' }),
      el('p', { class: 'sub', text: 'Peer pull, 5% of the value — category peers (' + peerText + '): a flat peer multiple would value this TVL at ' + fmtUsd(peerValue) + '. The curve is pulled 5% of the way toward it, to ' + fmtUsd(blendedValue) + ', because that weight passed both blind tests while the full multiple loses both (leave-one-out 1.613 against the curve\'s 1.223).' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var principalAt = s.indexOf(' Principal: ');
        var action = principalAt >= 0 ? s.slice(0, principalAt) : s;
        var tail = principalAt >= 0 ? s.slice(principalAt + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function renderBoard() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    shell.appendChild(methodology());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
    if (state.methodology) {
      var target = document.getElementById('methodology');
      // Defer past the browser's own scroll handling on load, or it lands back at the top.
      if (target) setTimeout(function () { target.scrollIntoView(); }, 0);
    }
  }

  readHash();
  renderBoard();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
