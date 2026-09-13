(function () {
  "use strict";
  var closers = [];
  window.TickerSuggestions = {
    close: function () { closers.forEach(function (close) { close(); }); },
    attach: function (config) {
      var prefix = config.prefix || "ticker";
      var input = document.getElementById(prefix), popup = document.getElementById(prefix + "-popup");
      if (!input) return function () {};
      if (!popup) {
        var wrapper=document.createElement("div"); wrapper.className="ticker-field";
        input.parentNode.insertBefore(wrapper,input); wrapper.appendChild(input);
        popup=document.createElement("div"); popup.id=prefix+"-popup"; popup.className="ticker-popup"; popup.hidden=true;
        var options=document.createElement("ul"); options.id=prefix+"-matches"; options.setAttribute("role","listbox"); options.setAttribute("aria-label","Suggested tickers");
        var message=document.createElement("div"); message.id=prefix+"-search-status"; message.className="ticker-search-status"; message.setAttribute("role","status"); message.setAttribute("aria-live","polite");
        popup.append(options,message); wrapper.appendChild(popup);
      }
      input.setAttribute("role","combobox"); input.setAttribute("aria-autocomplete","list"); input.setAttribute("aria-expanded","false");
      input.setAttribute("aria-controls",prefix+"-matches"); input.setAttribute("autocomplete","off");
      function token() {
        var start=0,end=input.value.length;
        if (config.multiple) {
          start=input.selectionStart==null ? end : input.selectionStart; end=start;
          while (start>0 && !/[,;]/.test(input.value[start-1])) start--;
          while (end<input.value.length && !/[,;]/.test(input.value[end])) end++;
          while (start<end && /\s/.test(input.value[start])) start++;
          while (end>start && /\s/.test(input.value[end-1])) end--;
        }
        return {start:start,end:end,text:input.value.slice(start,end).trim().toLowerCase()};
      }
      var list = document.getElementById(prefix + "-matches"), status = document.getElementById(prefix + "-search-status");
      var rows = [], active = -1, timer, controller, generation = 0, composing = false, cooldown = 0;
      var cache = new Map();
      var seeds = [
        ["AAPL", "Apple", "Stock"], ["MSFT", "Microsoft", "Stock"],
        ["AMZN", "Amazon", "Stock"], ["GOOGL", "Alphabet (Google)", "Stock"],
        ["NVDA", "NVIDIA", "Stock"], ["META", "Meta Platforms", "Stock"],
        ["TSLA", "Tesla", "Stock"], ["AMD", "Advanced Micro Devices", "Stock"],
        ["JPM", "JPMorgan Chase", "Stock"], ["BRK.B", "Berkshire Hathaway Class B", "Stock"],
        ["SPY", "SPDR S&P 500 ETF Trust", "Fund"], ["QQQ", "Invesco QQQ Trust", "Fund"],
        ["VTI", "Vanguard Total Stock Market ETF", "Fund"],
        ["TLT", "iShares 20+ Year Treasury Bond ETF", "Bond fund"],
        ["AGG", "iShares Core U.S. Aggregate Bond ETF", "Bond fund"],
        ["LQD", "iShares iBoxx Investment Grade Corporate Bond ETF", "Bond fund"],
        ["HYG", "iShares iBoxx High Yield Corporate Bond ETF", "Bond fund"],
        ["BTC/USD", "Bitcoin / US Dollar", "Crypto"], ["ETH/USD", "Ethereum / US Dollar", "Crypto"],
        ["EUR/USD", "Euro / US Dollar", "Currency pair"], ["GBP/USD", "British Pound / US Dollar", "Currency pair"],
        ["USD/JPY", "US Dollar / Japanese Yen", "Currency pair"]
      ].map(function (x) { return {symbol: x[0], name: x[1], type: x[2], exchange: "", country: ""}; });
      if (config.companiesOnly) seeds = seeds.filter(function (row) { return row.type === "Stock"; });
      if (!config.companiesOnly) document.querySelectorAll("#commodity option[data-kind]").forEach(function (option) {
        seeds.push({symbol: option.value, name: option.textContent.split(" · ")[0],
          type: option.dataset.kind === "spot" ? "Commodity price" : "Commodity fund · share price", exchange: "", country: ""});
      });
      function id(row) { return row.symbol + "|" + (row.exchange || ""); }
      function stop() {
        generation++; clearTimeout(timer);
        if (controller) controller.abort();
        controller = null;
      }
      function close() {
        stop(); popup.hidden = true; active = -1;
        input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
      }
      closers.push(close);
      function rank(row, query) {
        var symbol = row.symbol.toLowerCase(), name = row.name.toLowerCase();
        return symbol === query ? 0 : symbol.indexOf(query) === 0 ? 1 : name.indexOf(query) === 0 ? 2 : 3;
      }
      function matches(query, remote) {
        var local = seeds.filter(function (row) { return (row.symbol + " " + row.name).toLowerCase().indexOf(query) >= 0; });
        var merged = local.slice(), seen = new Set(local.map(id));
        (remote || []).forEach(function (row) {
          if (seen.has(id(row))) {
            // The SEC has issuer identities rather than exchange variants.
            // Its official company name should replace a common-name seed.
            if (config.companiesOnly) {
              var existing = merged.findIndex(function (x) { return id(x) === id(row); });
              if (existing >= 0) merged[existing] = row;
            }
            return;
          }
          // Replace the default listing of a popular ticker with the provider's
          // first explicit exchange match, then retain other distinct listings.
          var popular = merged.findIndex(function (x) { return x.symbol === row.symbol && !x.exchange && !/commodity|crypto|currency/i.test(x.type); });
          if (popular >= 0) merged[popular] = row;
          else merged.push(row);
          seen.add(id(row));
        });
        return merged.sort(function (a, b) { return rank(a, query) - rank(b, query); }).slice(0, 10);
      }
      function highlight(index) {
        active = index;
        Array.prototype.forEach.call(list.children, function (node, i) { node.setAttribute("aria-selected", i === active ? "true" : "false"); });
        if (active < 0) input.removeAttribute("aria-activedescendant");
        else {
          input.setAttribute("aria-activedescendant", list.children[active].id);
          list.children[active].scrollIntoView({block: "nearest"});
        }
      }
      function choose(index) {
        var row = rows[index];
        if (!row) return;
        if (config.multiple) {
          var part=token(), tail=input.value.slice(part.end), value=input.value.slice(0,part.start)+row.symbol+tail;
          var caret=part.start+row.symbol.length;
          if (!tail && value.split(/[\s,;]+/).filter(Boolean).length<4) { value+=", "; caret+=2; }
          if (input.maxLength>0 && value.length>input.maxLength) { status.textContent="The ticker list is too long. Remove an entry before adding another."; return; }
          input.value=value; input.setSelectionRange(caret,caret);
        } else input.value = row.symbol;
        close(); if (config.onSelect) config.onSelect(row);
      }
      function render(query, remote, message) {
        if (document.activeElement !== input) return;
        var selected = rows[active] ? id(rows[active]) : null;
        rows = matches(query, remote); list.replaceChildren();
        rows.forEach(function (row, i) {
          var option = document.createElement("li");
          option.id = prefix + "-option-" + i; option.className = "ticker-option";
          option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false");
          var symbol = document.createElement("span"); symbol.className = "ticker-symbol mono"; symbol.textContent = row.symbol;
          var description = document.createElement("span"); description.className = "ticker-description";
          var name = document.createElement("span"); name.className = "ticker-name"; name.textContent = row.name;
          var detail = document.createElement("span"); detail.className = "ticker-detail";
          detail.textContent = [row.type, row.exchange, row.country].filter(Boolean).join(" · ");
          description.append(name, detail); option.append(symbol, description);
          option.addEventListener("pointerdown", function (ev) { ev.preventDefault(); });
          option.addEventListener("click", function () { choose(i); });
          list.appendChild(option);
        });
        popup.hidden = false; input.setAttribute("aria-expanded", "true");
        highlight(selected ? rows.findIndex(function (row) { return id(row) === selected; }) : -1);
        status.textContent = message || (rows.length ? rows.length + " suggestions. Select a match to " + (config.selectionHint || (config.companiesOnly ? "research the company." : "load its chart.")) : "No matches. You can still enter a ticker and submit.");
      }
      function suggest() {
        stop();
        var query = token().text;
        if (!query || query.length > 48 || composing) { close(); return; }
        if (cache.has(query)) { render(query, cache.get(query)); return; }
        var canSearch = query.length >= 2 && config.getPassword() && Date.now() >= cooldown;
        render(query, [], canSearch ? "Searching for more matches…" : "Matching common " + (config.companiesOnly ? "company tickers." : "symbols and commodities.") + " Enter a ticker to look it up directly.");
        if (!canSearch) return;
        var current = generation;
        timer = setTimeout(function () {
          controller = new AbortController();
          fetch((config.endpoint || "/api/search") + "?q=" + encodeURIComponent(query), {signal: controller.signal, headers: {"x-tools-password": config.getPassword()}})
            .then(function (response) {
              if (!response.ok) {
                if (response.status === 429) cooldown = Date.now() + 60000;
                throw new Error("Search unavailable");
              }
              return response.json();
            }).then(function (data) {
              if (current !== generation) return;
              var results = Array.isArray(data.results) ? data.results.filter(function (row) {
                return row && typeof row.symbol === "string" && typeof row.name === "string" && typeof row.type === "string";
              }) : [];
              if (cache.size >= 50) cache.delete(cache.keys().next().value);
              cache.set(query, results); render(query, results);
            }).catch(function (error) {
              if (error.name === "AbortError" || current !== generation) return;
              render(query, [], "More suggestions are unavailable. Common matches still work, or enter a ticker directly.");
            });
        }, 400);
      }
      input.addEventListener("input", function () { if (config.onEdit) config.onEdit(); suggest(); });
      input.addEventListener("focus", function () { if (input.value.trim()) suggest(); });
      if (config.multiple) input.addEventListener("click",suggest);
      if (config.multiple) input.addEventListener("keyup",function (ev) {
        if (["ArrowLeft","ArrowRight","Home","End"].indexOf(ev.key)>=0) suggest();
      });
      input.addEventListener("blur", close);
      input.addEventListener("compositionstart", function () { composing = true; close(); });
      input.addEventListener("compositionend", function () { composing = false; suggest(); });
      input.addEventListener("keydown", function (ev) {
        if (composing || ev.isComposing) return;
        if (ev.key === "Escape") { ev.preventDefault(); close(); return; }
        if (ev.key === "Tab") { close(); return; }
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (popup.hidden) suggest();
          if (!popup.hidden && rows.length) highlight(ev.key === "ArrowDown" ? (active + 1) % rows.length : (active < 0 ? rows.length - 1 : (active - 1 + rows.length) % rows.length));
        } else if (ev.key === "Enter") {
          if (!popup.hidden && active >= 0) { ev.preventDefault(); choose(active); }
          else close();
        }
      });
      return function () { close(); var index=closers.indexOf(close); if (index>=0) closers.splice(index,1); };
    }
  };
})();
