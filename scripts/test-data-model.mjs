import {strict as assert} from 'node:assert';
import {parseCSV,defaultConfig,DEMO} from '../lib/analytics.ts';
import {prepareSource,compileFormula,applyFilters,validateFilters,profileColumn} from '../lib/data-model.ts';
import {calculate,chartData,formatChartNumber} from '../lib/chart-model.ts';
import {makeVisual,boardRows} from '../lib/visual-builder.ts';
import {applyModel} from '../lib/workspace-model.ts';
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
const source=parseCSV('Data;Região;Receita;Custo;Pessoa\n2026-08-01;Sul;100;60;Ana\n2026-09-01;Sul;200;80;Ana\n2026-09-02;Norte;300;100;Bia\n2026-09-03;Norte;;0;','test.csv','test');
const step=(kind,field,value,extra)=>({id:kind,kind,field,value,extra});
const config={...defaultConfig(source),dimension:'Região'};
test('formula precedence, parentheses, decimal comma and unary negatives',()=>{assert.equal(compileFormula('([Receita] - [Custo]) / [Receita]',source.columns)(source.rows[0]),.4);assert.equal(compileFormula('-2 * -3 + 1,5',source.columns)({}),7.5);});
test('formula rejects code, unknown fields, incomplete grammar and zero division',()=>{for(const s of ['alert(1)','[Unknown]+1','1 2','1+','(1+2','1;2'])assert.throws(()=>compileFormula(s,source.columns));assert.equal(compileFormula('1 / 0',[])({}),null);assert.equal(compileFormula('[Receita]+1',source.columns)(source.rows[3]),null);});
test('calculated columns preserve raw data and report null results',()=>{const p=prepareSource(source,[step('calculate','Lucro','[Receita]-[Custo]')]);assert.equal(p.source.rows[0].Lucro,'40');assert.equal(p.reports[0].invalid,1);assert.ok(p.source.numeric.includes('Lucro'));assert.equal(source.rows[0].Lucro,undefined);});
test('mixed CSV accepted for explicit type repair',()=>{const mixed=parseCSV('Nome;Valor\nA;12,5\nB;errado','mixed.csv','mixed');assert.equal(defaultConfig(mixed).aggregation,'count');const p=prepareSource(mixed,[step('type','Valor','number')]);assert.equal(p.reports[0].invalid,1);assert.equal(p.source.rows[0].Valor,'12.5');assert.equal(p.source.rows[1].Valor,'');assert.equal(mixed.rows[1].Valor,'errado');});
test('replacement and fill maintain declared type',()=>{const p=prepareSource(source,[step('fill','Receita','50'),step('replace','Região','Sul','SUL')]);assert.equal(p.source.rows[3].Receita,'50');assert.equal(p.source.rows[0]['Região'],'SUL');assert.match(prepareSource(source,[step('fill','Receita','abc')]).error,/numérico/);});
test('cell edit affects only selected row',()=>{const p=prepareSource(source,[step('edit','Receita','123','1')]);assert.equal(p.source.rows[1].Receita,'123');assert.equal(p.source.rows[0].Receita,'100');assert.equal(prepareSource(source,[]).source.rows[1].Receita,'200');});
test('deduplication chosen keys keeps first record',()=>{const p=prepareSource(source,[{...step('deduplicate','',''),fields:['Região']}]);assert.equal(p.source.rows.length,2);assert.equal(p.source.rows[0].Receita,'100');});
const rules={mode:'and',rules:[{id:'a',field:'Região',op:'eq',value:'sul'},{id:'b',field:'Receita',op:'gte',value:'150'}]};
test('AND OR, date range, empty and numeric filters',()=>{assert.equal(applyFilters(source.rows,source,rules).length,1);assert.equal(applyFilters(source.rows,source,{...rules,mode:'or'}).length,3);assert.equal(applyFilters(source.rows,source,{mode:'and',rules:[{id:'x',field:'Data',op:'between',value:'01/09/2026',end:'03/09/2026'}]}).length,3);assert.equal(applyFilters(source.rows,source,{mode:'and',rules:[{id:'x',field:'Receita',op:'empty',value:''}]}).length,1);assert.throws(()=>validateFilters(source,{mode:'and',rules:[{id:'x',field:'Receita',op:'gte',value:'abc'}]}));});
test('preparation filter and column profile',()=>{const p=prepareSource(source,[{...step('filter','',''),filters:rules}]);assert.equal(p.source.rows.length,1);assert.equal(profileColumn(source,'Receita').empty,1);});
test('rename and undo rebind visual measures and filters',()=>{const cfg={...config,visuals:[{...makeVisual('bar',source,config,'v'),measures:[{id:'m',field:'Receita',aggregation:'sum',color:'#000000',label:'Vendas'}],filters:rules}]};const next=applyModel(source,cfg,[step('rename','Receita','Vendas')]);assert.equal(next.visuals[0].measures[0].field,'Vendas');assert.equal(next.visuals[0].filters.rules[1].field,'Vendas');assert.equal(next.metric,'Vendas');const restored=applyModel(source,next,[]);assert.equal(restored.metric,'Receita');});
test('sum, median, min, max, distinct and no-data semantics',()=>{assert.equal(calculate(source.rows,'Receita','sum'),600);assert.equal(calculate(source.rows,'Receita','median'),200);assert.equal(calculate(source.rows,'Receita','min'),100);assert.equal(calculate(source.rows,'Receita','max'),300);assert.equal(calculate(source.rows,'Pessoa','distinct'),2);assert.equal(calculate([],'Receita','average'),null);assert.equal(calculate([],'Pessoa','count'),0);});
test('multiple measures, local filters, series split and totals',()=>{const v={...makeVisual('bar',source,config,'v'),measures:[{id:'a',field:'Receita',label:'Receita',color:'#000000',aggregation:'sum'},{id:'b',field:'Custo',label:'Custo',color:'#ffffff',aggregation:'average'}]};const d=chartData(source.rows,source,v);assert.equal(d.series.length,2);assert.equal(d.data.find(g=>g.name==='Sul').s1,70);assert.equal(chartData(source.rows,source,{...v,filters:rules}).rows.length,1);assert.equal(chartData(source.rows,source,{...v,splitBy:'Pessoa'}).series.length,3);assert.equal(boardRows(source,{...config,period:'30',filters:rules}).length,1);});
test('quarterly grouping, top-N and percent format',()=>{const v={...makeVisual('line',source,config,'v'),dimension:'Data',grain:'quarter',limit:0};assert.equal(chartData(source.rows,source,v).data.length,1);assert.equal(chartData(source.rows,source,{...v,grain:'day',limit:2}).data.length,2);assert.match(formatChartNumber(.25,'m',{kind:'percent',decimals:1,compact:false,prefix:'',suffix:''}),/25,0/);});
test('prepared data survives serialization and yields accurate chart totals',()=>{const cfg={...defaultConfig(DEMO),dataSteps:[step('calculate','Lucro','[Receita]-[Custo]')]};const p=prepareSource(DEMO,JSON.parse(JSON.stringify(cfg)).dataSteps);const v={...makeVisual('bar',p.source,cfg,'profit'),metric:'Lucro'};const expected=DEMO.rows.reduce((sum,r)=>sum+Number(r.Receita)-Number(r.Custo),0);assert.ok(Math.abs(chartData(p.source.rows,p.source,v).value-expected)<.00001);});
test('formatting changes display without changing source values or aggregates',()=>{
 const style={kind:'percent',decimals:1,compact:false,prefix:'',suffix:''};
 assert.equal(formatChartNumber(25,'m',{...style,percentInput:'whole'}),formatChartNumber(.25,'m',style));
 assert.match(formatChartNumber(-25,'m',{...style,percentInput:'whole'}),/-25,0/);
 for(const currency of ['BRL','USD','EUR']) {
  assert.equal(formatChartNumber(1250,'m',{...style,kind:'currency',currency}),new Intl.NumberFormat('pt-BR',{style:'currency',currency,minimumFractionDigits:1,maximumFractionDigits:1}).format(1250));
 }
 assert.equal(formatChartNumber(null,'m',style),'—');
 const v=makeVisual('donut',source,config,'formatted');
 const customized=JSON.parse(JSON.stringify({...v,numberStyle:{...style,percentInput:'whole'},labelSize:16,labelColor:'#123456',labelBold:true,donutLabel:'category-percent',categoryLabelLength:40}));
 assert.deepEqual(chartData(source.rows,source,customized).data,chartData(source.rows,source,v).data);
 assert.equal(customized.numberStyle.percentInput,'whole');
 assert.equal(customized.labelSize,16);
 assert.equal(source.rows[0].Receita,'100');
});
console.log(`${count} data and chart model checks passed.`);
