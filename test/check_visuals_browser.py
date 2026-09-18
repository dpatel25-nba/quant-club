"""Display edge cases with real DOM/SVG, no API requests or credentials."""
import pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser=p.chromium.launch()
    page=browser.new_page()
    page.set_content('<div id="target"></div>')
    page.add_script_tag(path=str(ROOT/'research-visuals.js'))
    page.evaluate('''() => {
      const V=ResearchVisuals, t=document.getElementById('target'), f=n=>Number.isFinite(n)?String(n):'Unavailable';
      const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
      V.waterfall(t,[{label:'Operating cash',value:-10},{label:'Capex',value:-5},{label:'Free cash',value:-15,total:true}],{title:'Negative cash',format:f});
      let bars=[...t.querySelectorAll('rect')];
      check(JSON.stringify(bars.map(b=>[+b.dataset.start,+b.dataset.end]))==='[[0,-10],[-10,-15],[0,-15]]','Negative waterfall must reconcile');
      check(bars.every(b=>+b.getAttribute('height')>0),'Negative values need visible bars');
      V.waterfall(t,[{label:'Missing',value:null}],{title:'Missing',format:f});
      check(!t.querySelector('svg'),'Missing cannot be plotted as zero');
      V.waterfall(t,[{label:'Zero',value:0,total:true}],{title:'Zero',format:f});
      check(t.querySelector('rect').dataset.value==='0'&&!/NaN|Infinity/.test(t.innerHTML),'Zero must remain valid');
      let spark=V.sparkline([{label:'A',value:-1},{label:'B',value:null},{label:'C',value:0}],f);
      check(spark.querySelector('path').getAttribute('d').split('M').length===3,'Missing observation must break sparkline');
      check(spark.querySelectorAll('circle').length===2,'Missing observation must not get a point');
      V.dots(t,[{label:'<img src=x>',value:null,detail:'Missing'},{label:'Negative',value:-4},{label:'Zero',value:0}],{format:f,reference:-2,referenceLabel:'Benchmark'});
      check(!t.querySelector('img')&&t.querySelectorAll('.rv-dot').length===2,'Escape labels and preserve missing vs zero');
      check([...t.querySelectorAll('.rv-dot')].every(d=>parseFloat(d.style.left)>=3&&parseFloat(d.style.left)<=97),'Markers stay within scale');
      t.innerHTML='<table><tbody><tr><th>Row</th><td>2</td><td>—</td><td>2</td></tr></tbody></table>';
      V.heatmap(t,[[2,null,2]]);
      check(t.querySelectorAll('.rv-heat-cell').length===2&&t.querySelectorAll('.rv-unavailable').length===1,'Missing sensitivity cells stay uncolored');
      check([...t.querySelectorAll('.rv-heat-cell')].every(c=>c.style.getPropertyValue('--rv-intensity')==='18%'),'Constant grid has a finite uniform intensity');
    }''')
    browser.close()
print('PASS: negative/zero/missing waterfall geometry, trend gaps, escaped labels, comparison scales and constant/missing sensitivity cells')
