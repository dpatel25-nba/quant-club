(function () {
  'use strict';
  var data = null, loading = false, password = '';
  var el = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var num = function (x, digits) { return x == null || !isFinite(x) ? '—' : Number(x).toFixed(digits == null ? 2 : digits); };
  var pct = function (x) { return x == null ? '—' : num(x*100) + '%'; };
  var periods = {full:'Full history', pre_2000:'Before 2000', post_2000:'2000 onward', macro_overlap:'April 1995 onward', through_1989:'Through 1989', '1990s':'1990–1999', '2000s':'2000–2009', '2010s':'2010–2019', '2020_onward':'2020 onward'};
  var models = {technical:'Technical rotation', frozen:'Frozen allocation', equal_style:'Equal style'};
  var colors = ['var(--accent)', 'var(--good)', 'var(--muted)'];

  function rows(name) {
    var t = data.tables[name];
    return t.rows.map(function (row) { var out = {}; t.columns.forEach(function (c, i) { out[c] = row[i]; }); return out; });
  }
  function table(caption, headers, entries) {
    return '<div class="sr-scroll"><table class="sr-table"><caption>'+esc(caption)+'</caption><thead><tr>'+headers.map(function (h) { return '<th scope="col">'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>'+entries.map(function (row) { return '<tr>'+row.map(function (v, i) { return (i ? '<td>' : '<th scope="row">')+esc(v)+(i ? '</td>' : '</th>'); }).join('')+'</tr>'; }).join('')+'</tbody></table></div>';
  }
  function download(name, content, type) {
    var link = document.createElement('a'), url = URL.createObjectURL(new Blob([content], {type:type || 'text/plain'}));
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function csv(t) {
    return [t.columns].concat(t.rows).map(function (row) { return row.map(function (value) {
      var s = value == null ? '' : String(value);
      // Prevent spreadsheet formula execution from textual cells.
      if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = "'"+s;
      return '"'+s.replace(/"/g, '""')+'"';
    }).join(','); }).join('\r\n');
  }
  function chart(id, dates, series, unit) {
    var W = 900, H = 285, L = 62, R = 16, T = 18, B = 34;
    var values = [].concat.apply([0], series.map(function (s) { return s.values; }));
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    var pad = (hi-lo)*.08 || 1; lo -= pad; hi += pad;
    var x = function (i) { return L + i/Math.max(1, dates.length-1)*(W-L-R); };
    var y = function (v) { return T + (hi-v)/(hi-lo)*(H-T-B); };
    var html = '<svg class="sr-chart" role="img" aria-label="'+esc(unit)+'" viewBox="0 0 '+W+' '+H+'"><title>'+esc(unit)+'</title>';
    for (var i=0; i<=4; i++) {
      var v = lo+(hi-lo)*i/4, yy = y(v);
      html += '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="var(--border)"/><text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end" fill="var(--muted)" font-size="11">'+num(v, 1)+'</text>';
    }
    html += '<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="var(--muted)" stroke-dasharray="4 4"/>';
    series.forEach(function (s, j) {
      html += '<path fill="none" stroke="'+colors[j]+'" stroke-width="2" stroke-linejoin="round" d="'+s.values.map(function (v, i) { return (i ? 'L' : 'M')+x(i).toFixed(2)+' '+y(v).toFixed(2); }).join(' ')+'"/>';
    });
    html += '<text x="'+L+'" y="'+(H-8)+'" fill="var(--muted)" font-size="11">'+esc(dates[0].slice(0,7))+'</text><text x="'+(W-R)+'" y="'+(H-8)+'" text-anchor="end" fill="var(--muted)" font-size="11">'+esc(dates[dates.length-1].slice(0,7))+'</text></svg>';
    html += '<div class="sr-legend">'+series.map(function (s, j) { return '<span style="--sr-color:'+colors[j]+'">'+esc(s.name)+'</span>'; }).join('')+'</div>';
    html += '<label class="note" for="'+id+'-slider">Inspect month</label><input id="'+id+'-slider" type="range" min="0" max="'+(dates.length-1)+'" value="'+(dates.length-1)+'" style="width:100%"><div id="'+id+'-readout" class="note" aria-live="polite"></div>';
    el(id).innerHTML = html;
    var readout = function (i) { el(id+'-readout').textContent = dates[i].slice(0,10)+' · '+series.map(function (s) { return s.name+': '+num(s.values[i]); }).join(' · ')+' ('+unit+')'; };
    el(id+'-slider').addEventListener('input', function () { readout(Number(this.value)); });
    readout(dates.length-1);
  }
  function render() {
    if (!data) return;
    renderOutlook();
    var panel = el('sr-panel').value, delay = Number(el('sr-delay').value), period = el('sr-period').value, cost = Number(el('sr-cost').value);
    var scenario = function (r) { return r.panel === panel && r.delay === delay; };
    var timing = rows('technical_robustness_summary').filter(function (r) { return scenario(r) && r.period === period; })[0];
    var portfolios = rows('portfolio_summary').filter(function (r) { return scenario(r) && r.period === period && r.cost_bps === cost; });
    var tech = portfolios.filter(function (r) { return r.model === 'technical'; })[0];
    el('sr-sample').textContent = timing.target_start.slice(0,10)+' to '+timing.target_end.slice(0,10)+' · '+timing.n+' target months · '+panel+' · '+delay+'-month delay';
    el('sr-kpis').innerHTML = [
      [num(timing.dynamic), 'Dynamic Rank IC × 100'], [pct(tech.annual_pnl), 'Annual fixed-notional P&L · '+cost+' bps cost'], [pct(tech.max_drawdown), 'Additive drawdown / reference capital']
    ].map(function (k) { return '<div class="sr-kpi"><strong>'+esc(k[0])+'</strong><span>'+esc(k[1])+'</span></div>'; }).join('');
    var byEra = rows('technical_robustness_summary').filter(function (r) { return r.panel === panel && r.delay === delay; });
    el('sr-era-table').innerHTML = table('Technical IC; static preferences are re-estimated within each period.', ['Period','Months','Headline','Static','Dynamic'], byEra.map(function (r) { return [periods[r.period], r.n, num(r.headline), num(r.static), num(r.dynamic)]; }));
    var rolling = rows('technical_robustness_rolling').filter(function (r) { return scenario(r) && r.target_end >= timing.target_start && r.target_end <= timing.target_end; });
    chart('sr-timing-chart', rolling.map(function (r) { return r.target_end; }), ['dynamic','headline','static'].map(function (m) { return {name:m.charAt(0).toUpperCase()+m.slice(1), values:rolling.map(function (r) { return r[m]; })}; }), 'IC × 100');
    el('sr-pnl-table').innerHTML = table('Selected period; P&L and drawdown are relative to fixed reference capital.', ['Allocation','Annual P&L','Annual vol.','P&L / vol.','Drawdown','Turnover / year'], portfolios.map(function (r) { return [models[r.model],pct(r.annual_pnl),pct(r.annual_volatility),num(r.pnl_vol_ratio),pct(r.max_drawdown),num(r.annual_turnover)]; }));
    var paths = rows('portfolio_monthly').filter(function (r) { return scenario(r) && r.target_date >= timing.target_start && r.target_date <= timing.target_end; });
    var datePath = paths.filter(function (r) { return r.model === 'technical'; }).map(function (r) { return r.target_date; });
    var first = new Date(datePath[0]);
    var origin = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 0)).toISOString();
    chart('sr-pnl-chart', [origin].concat(datePath), ['technical','frozen','equal_style'].map(function (m) {
      var cumulative = 0, values = [0];
      paths.filter(function (r) { return r.model === m; }).forEach(function (r) { cumulative += r.gross_pnl-r.allocation_turnover*cost/10000; values.push(cumulative*100); });
      return {name:models[m], values:values};
    }), '% of reference capital');
    var primary = rows('portfolio_uncertainty').filter(function (r) { return r.primary && scenario(r); })[0];
    el('sr-primary').textContent = 'Fixed primary test: 2000 onward, 10 bps per allocation-turnover unit, technical minus frozen. Annual difference '+pct(primary.annual_difference)+'; marginal 95% interval ['+pct(primary.ci_low)+', '+pct(primary.ci_high)+']; six-test adjusted p = '+num(primary.p_bonferroni_primary,4)+'. This test stays fixed when you explore other periods or costs.';
    var weighting = rows('weighting_audit_summary').filter(function (r) { return r.panel === panel && r.pool === 'full' && r.solver === 'inverse' && r.shrinkage === 0; });
    el('sr-weighting').innerHTML = table('Weighting audit · '+weighting[0].target_start.slice(0,10)+' to '+weighting[0].target_end.slice(0,10)+' · '+weighting[0].n+' months · original availability assumption', ['Rule','Rank IC × 100','Predictors'], weighting.map(function (r) { return [r.rule,num(r.rank_ic),r.predictors]; }));
    var macro = rows('macro_rank_ic').filter(function (r) { return scenario(r) && ['technical','macro','blend'].indexOf(r.model) >= 0; });
    el('sr-macro').innerHTML = table('Macro comparison · April 1995–July 2026 · 376 matched target months', ['Family','Headline IC','Static IC','Dynamic IC'], macro.map(function (r) { return [r.model,num(r.rank_ic),num(r.static),num(r.dynamic)]; }));
    var nested = rows('nested_selection_summary').filter(function (r) { return scenario(r) && (/^select/.test(r.model) || r.model === 'all_equal' || r.model === 'unique_equal'); });
    el('sr-selection').innerHTML = table('Nested selection · January 1984–July 2026 · 511 target months; annual choices use prior available validation scores.', ['Model','Rank IC × 100','Months'], nested.map(function (r) { return [r.model,num(r.rank_ic),r.n]; }));
    var baseline = rows('rank_ic_'+panel+'_matched');
    el('sr-predictors').innerHTML = table('Individual technical predictors · '+baseline[0].n+' matched months · original availability assumption; units are IC × 100.', ['Predictor','Headline','Static','Dynamic'], baseline.map(function (r) { return [r.predictor,num(r.rank_ic),num(r.static),num(r.dynamic)]; }));
  }

  function library() {
    el('sr-docs').innerHTML = Object.keys(data.reports).map(function (name) { return '<div class="sr-doc"><b>'+esc(name.replace(/_/g,' '))+'</b><button class="sr-download" data-doc="'+esc(name)+'">Read</button> <button class="sr-download" data-save="'+esc(name)+'">Download .md</button></div>'; }).join('');
    Array.prototype.forEach.call(el('sr-docs').querySelectorAll('[data-doc]'), function (b) { b.addEventListener('click', function () { el('sr-document').textContent = data.reports[b.dataset.doc]; el('sr-document').hidden = false; el('sr-document').scrollIntoView({block:'start',behavior:'smooth'}); }); });
    Array.prototype.forEach.call(el('sr-docs').querySelectorAll('[data-save]'), function (b) { b.addEventListener('click', function () { download(b.dataset.save, data.reports[b.dataset.save], 'text/markdown'); }); });
    el('sr-table-choice').innerHTML = Object.keys(data.tables).map(function (name) { return '<option value="'+esc(name)+'">'+esc(name.replace(/_/g,' '))+'</option>'; }).join('');
    el('sr-exported').textContent = 'Snapshot exported '+data.exported_at.slice(0,10)+' · 15 styles · 18 technical predictors · 10 macro predictors';
  }

  var styleNames = {ACC:'Accruals',BAB:'Low beta',CFY:'Cash-flow yield',DY:'Dividend yield',EY:'Earnings yield',INV:'Low investment',LIVOL:'Low idiosyncratic volatility',LTR:'Long-term reversal',LVOL:'Low volatility',MOM:'Momentum',NSI:'Low net share issuance',PROF:'Profitability',SIZE:'Small size',STR:'Short-term reversal',VAL:'Value'};
  function renderOutlook() {
    var panel=el('sr-out-panel').value, delay=Number(el('sr-out-delay').value), horizon=Number(el('sr-horizon').value);
    var selected=rows('outlook_latest').filter(function(r){return r.panel===panel&&r.delay===delay&&r.horizon===horizon;});
    var modelLabels={cross_sectional:'CSM',dma:'DMA',trm:'TRM',ecm:'ECM'};
    var order=el('sr-rank-order').value;
    var byModel={};
    selected.forEach(function(r){if(!byModel[r.model])byModel[r.model]={};byModel[r.model][r.style]=r;});
    var ranked=selected.filter(function(r){return r.model===order;}).sort(function(a,b){return a.rank-b.rank||a.style.localeCompare(b.style);});
    var meta=ranked[0];
    el('sr-out-date').textContent='Forecast as of '+meta.formation_date.slice(0,10)+' · style inputs through '+meta.source_end.slice(0,10)+' · outlook '+meta.target_start.slice(0,10)+' to '+meta.target_end.slice(0,10)+'. Latest training outcome: '+meta.training_target_end.slice(0,10)+'. ECM macro state: '+meta.formation_date.slice(0,10)+'.';
    var delta=function(v){return v==null?'—':(v>0?'+':'')+num(v,Number.isInteger(v)?0:1);};
    el('sr-ranking').innerHTML=table('Ordered by '+modelLabels[order]+'. Rank 1 = strongest relative outlook. Score and Δ refer to '+modelLabels[order]+'. Scores are not percentage returns; Δ is rank improvement since the preceding forecast month.',
      ['Factor portfolio','CSM rank','DMA rank','TRM rank','ECM rank',modelLabels[order]+' score',modelLabels[order]+' Δ','DMA candidate rank range'],ranked.map(function(r){
        var entries=[r.style+' · '+styleNames[r.style]];
        ['cross_sectional','dma','trm','ecm'].forEach(function(m){var value=byModel[m][r.style].rank;entries.push(num(value,Number.isInteger(value)?0:1));});
        var d=byModel.dma[r.style];return entries.concat([num(r.score,3),delta(r.rank_change),num(d.candidate_rank_min,1)+'–'+num(d.candidate_rank_max,1)]);
      }));
    var weights=rows('outlook_weights').filter(function(r){return r.panel===panel&&r.delay===delay&&r.horizon===horizon;});
    var candidateNames={trend:'Trend model',risk_shape:'Risk & shape model',all:'All signals',all_strong:'All signals · stronger shrinkage'};
    el('sr-dma-weights').innerHTML=weights.map(function(r){return '<div class="sr-model"><span>'+esc(candidateNames[r.candidate])+'</span><strong>'+pct(r.weight)+'</strong><div class="sr-bar"><span style="width:'+num(100*r.weight,3)+'%"></span></div></div>';}).join('');
    el('sr-dma-note').textContent='DMA updates from completed, published outcomes only. Latest feedback ends '+weights[0].feedback_target_end.slice(0,10)+'. Candidate rank range shows model disagreement, not a confidence interval. This first specification has not established an investable edge.';
    var validation=rows('outlook_validation').filter(function(r){return r.panel===panel&&r.delay===delay&&r.horizon===horizon&&r.period==='post_2000';});
    el('sr-out-validation').innerHTML=table('Retrospective validation from 2000 onward · '+horizon+'-month outcomes overlap when the horizon exceeds one month. No significance claim.', ['Model','Mean realized Rank IC × 100','Forecasts','First target','Last target'],validation.map(function(r){return [modelLabels[r.model],num(r.rank_ic),r.n,r.target_start.slice(0,10),r.target_end.slice(0,10)];}));
    var window=Number(el('sr-corr-window').value);
    var corr=rows('outlook_correlations').filter(function(r){return r.panel===panel&&r.delay===delay&&r.window===window;});
    var styles=Object.keys(styleNames).sort(), lookup={};
    corr.forEach(function(r){lookup[r.style_a+'|'+r.style_b]=r.correlation;});
    var h='<div class="sr-scroll"><table class="sr-table sr-heatmap"><caption>Historical Pearson correlation · '+esc(corr[0].source_start.slice(0,10))+' to '+esc(corr[0].source_end.slice(0,10))+' · '+window+' complete monthly returns. This window is independent of the forecast horizon.</caption><thead><tr><th scope="col">Style</th>';
    styles.forEach(function(s){h+='<th scope="col" title="'+esc(styleNames[s])+'">'+s+'</th>';});h+='</tr></thead><tbody>';
    styles.forEach(function(a){h+='<tr><th scope="row" title="'+esc(styleNames[a])+'">'+a+'</th>';styles.forEach(function(b){var v=lookup[a+'|'+b],color=v<0?'168,52,47':'20,80,122';h+='<td style="background:rgba('+color+','+num(Math.abs(v)*.32,3)+')" title="'+esc(styleNames[a]+' / '+styleNames[b]+': '+num(v,3))+'">'+num(v,2)+'</td>';});h+='</tr>';});
    el('sr-correlation').innerHTML=h+'</tbody></table></div>';
  }
  function open(pw) {
    password = pw || password;
    if (!password) { el('sr-status').textContent = 'Unlock Research Tools to load this study.'; return; }
    if (data) { render(); return; }
    if (loading) return;
    loading = true; el('sr-status').textContent = 'Loading the research snapshot…';
    el('sr-retry').hidden = true;
    fetch('/api/style-rotation', {headers:{'X-Tools-Password':password}, cache:'no-store'}).then(function (r) {
      if (!r.ok) throw new Error(r.status === 401 ? 'Your access could not be verified. Unlock Research Tools again.' : 'The research snapshot could not be loaded. Please retry.');
      return r.json();
    }).then(function (snapshot) {
      if (snapshot.schema !== 1 || !snapshot.tables || !snapshot.reports) throw new Error('The research snapshot format is not supported.');
      data = snapshot; library(); render(); el('sr-content').hidden = false; el('sr-status').textContent = ''; loading = false;
    }).catch(function (e) { loading = false; data = null; el('sr-content').hidden = true; el('sr-status').textContent = e.message; el('sr-retry').hidden = false; });
  }
  ['sr-panel','sr-delay','sr-period','sr-cost'].forEach(function (id) { el(id).addEventListener('change', render); });
  ['sr-out-panel','sr-out-delay','sr-horizon','sr-corr-window','sr-rank-order'].forEach(function(id){el(id).addEventListener('change',function(){if(data)renderOutlook();});});
  el('sr-out-csv').addEventListener('click',function(){if(!data)return;var t=data.tables.outlook_latest;var subset=rows('outlook_latest').filter(function(r){return r.panel===el('sr-out-panel').value&&r.delay===Number(el('sr-out-delay').value)&&r.horizon===Number(el('sr-horizon').value);});download('factor-outlook-'+el('sr-horizon').value+'m.csv',csv({columns:t.columns,rows:subset.map(function(r){return t.columns.map(function(c){return r[c];});})}),'text/csv');});
  el('sr-retry').addEventListener('click', function () { open(password); });
  el('sr-csv').addEventListener('click', function () { if (data) { var name = el('sr-table-choice').value; download(name+'.csv', csv(data.tables[name]), 'text/csv'); } });
  el('sr-bundle').addEventListener('click', function () { if (data) download('style-rotation-research.json', JSON.stringify(data), 'application/json'); });
  el('sr-source').addEventListener('click', function () { if (data) download('style-rotation-source.json', JSON.stringify(data.source, null, 2), 'application/json'); });
  window.StyleRotation = {open:open};
  if (window.location.hash === '#style-rotation') {
    document.querySelector('.mtab[data-m="tools"]').click();
    document.querySelector('.tab[data-v="style-rotation"]').click();
  }
}());
