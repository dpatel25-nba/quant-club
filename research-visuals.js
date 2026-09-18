(function () {
  'use strict';
  // Presentation only: all financial values come from the existing data/model engines.
  function node(tag, text, cls) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function svg(tag, attrs, text) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function extent(values) {
    var valid = values.filter(Number.isFinite), min = Math.min.apply(null, [0].concat(valid)), max = Math.max.apply(null, [0].concat(valid));
    return {min:min, max:max, span:max - min || 1};
  }
  function empty(target, message) { target.replaceChildren(node('p', message, 'rv-empty')); }
  function sparkline(points, format) {
    var values = points.map(function (p) { return p.value; }).filter(Number.isFinite);
    var s = svg('svg', {viewBox:'0 0 220 54', role:'img', class:'rv-spark'});
    var description = points.map(function (p) { return p.label + ': ' + format(p.value); }).join('; ');
    s.setAttribute('aria-label', description);
    s.appendChild(svg('title', {}, description));
    if (!values.length) return s;
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min;
    var x = function (i) { return 8 + i * 204 / Math.max(1, points.length - 1); };
    var y = function (v) { return span ? 44 - (v - min) / span * 34 : 27; };
    var path = '', connected = false;
    points.forEach(function (p, i) {
      if (!Number.isFinite(p.value)) { connected = false; return; }
      path += (connected ? ' L ' : ' M ') + x(i) + ' ' + y(p.value); connected = true;
      s.appendChild(svg('circle', {cx:x(i), cy:y(p.value), r:2.8, fill:'var(--accent)'}));
    });
    s.appendChild(svg('path', {d:path, fill:'none', stroke:'var(--accent)', 'stroke-width':2, 'stroke-linejoin':'round'}));
    return s;
  }
  function waterfall(target, steps, options) {
    if (!steps.length || steps.some(function (d) { return !Number.isFinite(d.value); })) {
      empty(target, options.empty || 'Complete the required inputs to see this breakdown.'); return;
    }
    var sum = 0;
    var bars = steps.map(function (d) {
      var start = d.total ? 0 : sum;
      sum = d.total ? d.value : sum + d.value;
      return {step:d, start:start, end:sum};
    });
    var domain = extent(bars.flatMap(function (d) { return [d.start, d.end]; }));
    var width = Math.max(520, steps.length * 112), height = 290, left = 30, right = width - 30;
    var y = function (v) { return 211 - (v - domain.min) / domain.span * 155; };
    var slot = (right - left) / steps.length, barWidth = Math.min(64, slot * .65);
    var s = svg('svg', {viewBox:'0 0 ' + width + ' ' + height, role:'img', class:'rv-waterfall'});
    s.style.minWidth = width + 'px';
    var description = options.title + '. ' + steps.map(function (d) { return d.label + ': ' + options.format(d.value); }).join('; ');
    s.setAttribute('aria-label', description); s.appendChild(svg('title', {}, description));
    [domain.min, domain.min + domain.span / 2, domain.max].forEach(function (v) {
      s.appendChild(svg('line', {x1:left, x2:right, y1:y(v), y2:y(v), stroke:'var(--border)', 'stroke-dasharray':'3 5'}));
    });
    s.appendChild(svg('line', {x1:left, x2:right, y1:y(0), y2:y(0), stroke:'var(--muted)', opacity:.6}));
    bars.forEach(function (d, i) {
      var center = left + slot * (i + .5), top = Math.min(y(d.start), y(d.end));
      var color = d.step.total ? 'var(--accent)' : d.step.value < 0 ? 'var(--rv-warm)' : 'var(--rv-teal)';
      if (i) s.appendChild(svg('line', {x1:center-slot+barWidth/2, x2:center-barWidth/2, y1:y(bars[i-1].end), y2:y(bars[i-1].end), stroke:'var(--muted)', 'stroke-dasharray':'3 3', opacity:.6}));
      s.appendChild(svg('rect', {x:center-barWidth/2, y:top, width:barWidth, height:Math.max(1, Math.abs(y(d.start)-y(d.end))), rx:3, fill:color, 'data-value':d.step.value, 'data-start':d.start, 'data-end':d.end}));
      s.appendChild(svg('text', {x:center, y:top-10, 'text-anchor':'middle', fill:'var(--text)', 'font-size':12, 'font-weight':600}, options.format(d.step.value)));
      var words = d.step.label.split(' '), lines = [''];
      words.forEach(function (word) { var last=lines.length-1; if ((lines[last]+' '+word).trim().length>15 && lines[last]) lines.push(word); else lines[last]=(lines[last]+' '+word).trim(); });
      lines.forEach(function (line, j) { s.appendChild(svg('text', {x:center, y:242+j*15, 'text-anchor':'middle', fill:'var(--muted)', 'font-size':11}, line)); });
    });
    var wrap=node('div', null, 'rv-scroll'); wrap.tabIndex=0;wrap.setAttribute('aria-label', 'Scrollable ' + options.title.toLowerCase());wrap.appendChild(s);
    target.replaceChildren(wrap);
  }
  function dots(target, rows, options) {
    if (!rows.length) { empty(target, 'Load companies to compare their financials.'); return; }
    var domain = extent(rows.map(function (r) { return r.value; }).concat(options.reference));
    var position = function (v) { return 3 + (v-domain.min)/domain.span*94; };
    var list = node('div', null, 'rv-dot-list');
    var axis=node('div', null, 'rv-dot-axis');
    axis.append(node('span', options.format(domain.min)), node('span', options.format(domain.max)));
    list.appendChild(axis);
    rows.forEach(function (r) {
      var row=node('div', null, 'rv-dot-row'), label=node('div', r.label, 'rv-dot-label');
      label.appendChild(node('small', r.detail || ''));
      var track=node('div', null, 'rv-dot-track');track.setAttribute('aria-hidden','true');
      var zero=node('span', null, 'rv-dot-zero');zero.style.left=position(0)+'%';track.appendChild(zero);
      if (Number.isFinite(options.reference)) { var ref=node('span', null, 'rv-dot-reference');ref.style.left=position(options.reference)+'%';track.appendChild(ref); }
      if (Number.isFinite(r.value)) {
        var fill=node('span', null, 'rv-dot-stem'), dot=node('span', null, 'rv-dot');
        fill.style.left=Math.min(position(0),position(r.value))+'%';fill.style.width=Math.abs(position(r.value)-position(0))+'%';
        dot.style.left=position(r.value)+'%'; track.append(fill,dot);
      }
      if (r.selected) row.classList.add('rv-selected');
      row.append(label,track,node('strong', Number.isFinite(r.value) ? options.format(r.value) : 'Unavailable', 'rv-dot-value'));
      list.appendChild(row);
    });
    target.replaceChildren(list);
    if (Number.isFinite(options.reference)) target.appendChild(node('p', 'Dashed marker: '+options.referenceLabel+' · '+options.format(options.reference), 'rv-caption'));
  }
  function heatmap(target, values) {
    var valid=values.flat().filter(Number.isFinite), low=Math.min.apply(null,valid), high=Math.max.apply(null,valid);
    target.querySelectorAll('tbody tr').forEach(function (row,i) {
      row.querySelectorAll('td').forEach(function (cell,j) {
        var v=values[i][j];
        if (!Number.isFinite(v)) {cell.classList.add('rv-unavailable');return;}
        cell.classList.add('rv-heat-cell');
        cell.style.setProperty('--rv-intensity', (high===low ? 18 : 5+30*(v-low)/(high-low))+'%');
      });
    });
  }
  window.ResearchVisuals={sparkline:sparkline,waterfall:waterfall,dots:dots,heatmap:heatmap};
})();
