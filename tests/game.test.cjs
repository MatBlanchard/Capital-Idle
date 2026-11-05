const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('app/src/main/assets/index.html','utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'Script principal présent');
new vm.Script(source,{filename:'index.html'});
function game(){
 const nodes=new Map();
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},value:'',textContent:'',innerHTML:''});return nodes.get(id)},addEventListener(){}};
 const local=new Map();
 const ctx={document:doc,window:{},Date,Math,Number,JSON,Array,Object,Set,Map,console,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},setInterval(){},setTimeout(){return 1},clearTimeout(){},confirm(){return true}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,run:code=>vm.runInContext(code,ctx)};
}
test('sauvegarde initiale et migration v5',()=>{
 const g=game();assert.equal(g.run('state.version'),6);
 assert.equal(g.run('state.workers.length'),24);
 assert.equal(g.run('migrate({...fresh(),version:5}).version'),6);
});
test('recrutement interdit sans responsable RH',()=>{
 const g=game();g.run("startGame('farm')");
 assert.equal(g.run("hireWorker('player',candidates()[0].id,'player-1')"),false);
});
test('école, formation et recrutement après diplôme',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.stock.wood=20;state.agents.player.stock.ore=10;state.selected=20;build('school')");
 assert.equal(g.run("state.agents.player.buildings.some(b=>b.type==='school')"),true);
 g.run("trainWorker(candidates()[0].id,'hr');trainingCycle();trainingCycle()");
 assert.equal(g.run("state.workers.some(w=>w.qualification==='hr')"),true);
 g.run("appointManager(state.workers.find(w=>w.qualification==='hr').id,'hr')");
 assert.equal(g.run("canHire(agent('player'))"),true);
 g.run("state.agents.player.buildings[0].wage=60");
 assert.equal(g.run("hireWorker('player',candidates()[0].id,'player-1')"),true);
});
test('ordre boursier et matching compatibles',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.stock.food=3");
 assert.equal(g.run("placeOrder('player','sell','food',1,5,false)"),true);
 assert.equal(g.run("placeOrder('atlas','buy','food',1,5,false)"),true);
 assert.equal(g.run("state.trades.some(t=>t.item==='food')"),true);
});
test('production dépend de la productivité',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.buildings[0].wage=60;agent('player').managers.hr.push('w99');state.workers.push(initWorker({id:'w99',home:0,cash:100,food:3,health:3,job:null,alive:true,adult:true,expectedWage:10,productivity:1.3}));");
 g.run("hireWorker('player','w99','player-1')");
 const before=g.run("agent('player').stock.food");g.run("simulate(150000)");
 assert.ok(g.run("agent('player').stock.food")>before);
});
