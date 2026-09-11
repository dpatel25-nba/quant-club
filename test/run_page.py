"""Run the page with promises that actually resolve, and report thrown errors.

Earlier checks stubbed fetch with a thenable that returned itself WITHOUT
invoking its callback, so no .then body ever executed. A ReferenceError
inside the portfolio callback therefore passed every check and only surfaced
in the browser as "Can't find variable: S".

This resolves synchronously with realistic four-holding data and fires the
Analyse handler, so the callback bodies run. Proven to catch that bug:
reintroducing it makes this fail.

Usage: python3 test/run_page.py
"""
import re, pathlib, subprocess, sys, json
S=pathlib.Path('/Users/dylanpatel/Documents/quant-club/index.html').read_text()
js="\n".join(re.findall(r'<script>(.*?)</script>', S, re.S))

# A DOM + network stub where promises RESOLVE SYNCHRONOUSLY, so every .then
# body actually runs. The old stub returned a self-referential thenable that
# never invoked its callback, which is exactly why a ReferenceError inside a
# portfolio callback survived every previous check.
stub = r'''
var LOG=[], ERRORS=[];
function Node(id){ this.id=id||""; this.style={}; this.dataset={r:"1y",v:"lookup",m:"2024-03"};
  this.hidden=false; this.value=""; this.disabled=false; this.clientWidth=880;
  this.textContent=""; this.innerHTML=""; this.className="";
  this.classList={toggle:function(){},add:function(){},remove:function(){}};
  this.addEventListener=function(ev,fn){ this["on_"+ev]=fn; };
  this.setAttribute=function(){}; this.getAttribute=function(){};
  this.appendChild=function(){}; this.remove=function(){};
  this.insertAdjacentHTML=function(){};
  this.getBoundingClientRect=function(){return {left:0,width:880};};
  this.querySelector=function(){return new Node();};
  this.querySelectorAll=function(){return [];};
}
var NODES={};
function getNode(id){ if(!NODES[id]) NODES[id]=new Node(id); return NODES[id]; }

// four holdings, as the default portfolio has
var ROWS=[];
function mkRow(sym,w){
  var r=new Node(); r.querySelector=function(sel){
    var n=new Node(); n.value = (sel===".tk")?sym:String(w); return n; };
  return r;
}
["AAPL","MSFT","JNJ","XOM"].forEach(function(s,i){ ROWS.push(mkRow(s,[40,30,20,10][i])); });

var document={ getElementById:getNode,
  createElement:function(){return new Node();},
  querySelectorAll:function(sel){
    if(sel==="#rows .hrow") return ROWS;
    return [new Node()];
  }};
var window={addEventListener:function(){},scrollTo:function(){}};
var sessionStorage={getItem:function(){return null;},setItem:function(){}};
var TextEncoder=function(){this.encode=function(){return [];};};
var crypto={subtle:{digest:function(){return P({});}}};
var setTimeout=function(f){ return 1; }; var clearTimeout=function(){};

// synchronous promise: callbacks RUN
function P(v){ return { then:function(f,r){ try{ var o=f?f(v):v;
      return (o&&o.then)?o:P(o);}catch(e){ ERRORS.push(String(e&&e.message||e)); return { then:function(){return this;}, catch:function(g){ g(e); return this; } }; } },
    catch:function(){ return this; } }; }
P.resolve=function(v){return P(v);};
P.all=function(arr){ var out=[]; for(var i=0;i<arr.length;i++){
    var it=arr[i]; if(it&&it.then){ it.then(function(v){out.push(v);}); } else out.push(it); }
  return P(out); };
var Promise=P;

// realistic series: 300 daily bars
function series(sym){
  var pts=[], px=100, d=new Date(Date.UTC(2023,0,2));
  for(var i=0;i<300;i++){
    px *= 1 + ((i*7919+sym.length*13)%11 - 5)/500;
    var iso=d.toISOString().slice(0,10);
    pts.push({t:iso,c:px,v:1e6});
    d=new Date(d.getTime()+86400000);
  }
  return {symbol:sym,range:"5y",label:"past 5 years",currency:"USD",exchange:"NASDAQ",
          type:"Common Stock",name:sym+" Inc",points:pts,quote:null};
}
var fetch=function(url){
  LOG.push(url);
  var m=/symbol=([^&]+)/.exec(url);
  var sym=m?decodeURIComponent(m[1]):"AAPL";
  return P({ ok:true, json:function(){ return P(series(sym)); } });
};
'''
probe = r'''
print("  fetches issued: "+LOG.length);
print("  errors captured: "+(ERRORS.length?JSON.stringify(ERRORS):"none"));
if(ERRORS.length) { print("  RESULT: FAIL"); } else { print("  RESULT: PASS"); }
'''
# call the portfolio analysis by firing the button handler the page registered
call = r'''
try {
  var b = document.getElementById("build");
  if (b && b.on_click) { b.on_click(); }
  else { print("  could not reach the Analyse handler"); }
} catch (e) { ERRORS.push("handler: "+String(e && e.message || e)); }
'''
out = stub + js + call + probe
f=pathlib.Path('/private/tmp/claude-501/-Users-dylanpatel-Documents-nba-data/04d6867c-4213-47cc-8934-2c7455c5b17d/scratchpad/live.js')
f.write_text(out)
r=subprocess.run(["/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc",str(f)],capture_output=True,text=True)
print(r.stdout.strip() or r.stderr.strip()[:600])
