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
test('recrutement manuel autorisé sans responsable RH',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.buildings[0].wage=60");
 assert.equal(g.run("hireWorker('player',candidates()[0].id,'player-1')"),true);
});
test('école, formation et recrutement après diplôme',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.stock.wood=20;state.agents.player.stock.ore=10;state.selected=60;build('school')");
 assert.equal(g.run("state.agents.player.buildings.some(b=>b.type==='school')"),true);
 g.run("trainWorker(candidates()[0].id,'hr');trainingCycle();trainingCycle()");
 assert.equal(g.run("state.workers.some(w=>w.qualification==='hr')"),true);
 g.run("appointManager(state.workers.find(w=>w.qualification==='hr'&&!w.managerFor).id,'hr')");
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

test('RH automatise le recrutement du joueur sur les postes vacants',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.buildings[0].wage=60");
 assert.equal(g.run("canHire(agent('player'))"),false);
 assert.equal(g.run("state.workers.filter(w=>w.job==='player-1').length"),0);
 g.run("agent('player').managers.hr.push('w999');state.workers.push(initWorker({id:'w999',home:0,cash:100,food:3,health:3,job:null,alive:true,adult:true,managerFor:'player',managerRole:'hr',qualification:'hr'}));");
 g.run("aiRecruit()");
 assert.ok(g.run("state.workers.filter(w=>w.job==='player-1').length")>0);
});

test('neuf entreprises IA réparties sur trois secteurs',()=>{
 const g=game();
 assert.equal(g.run('AI_IDS.length'),9);
 assert.equal(g.run("AI_IDS.filter(id=>agent(id).buildings[0].type==='farm').length"),3);
 assert.equal(g.run("AI_IDS.filter(id=>agent(id).buildings[0].type==='lumber').length"),3);
 assert.equal(g.run("AI_IDS.filter(id=>agent(id).buildings[0].type==='mine').length"),3);
});
test('diversification : priorité au secteur non représenté',()=>{
 const g=game();
 assert.notEqual(g.run("chooseExpansionType(agent('atlas'))"),'farm');
});
test('rachat de bâtiment IA : propriété et argent transférés',()=>{
 const g=game();
 g.run("agent('mercure').buildings[0].type='farm';agent('mercure').buildings.push({id:'mercure-extra',type:chooseExpansionType(agent('atlas')),pos:60,wage:20});agent('atlas').cash=500");
 const before=g.run("agent('mercure').cash");
 const details=g.run("({cash:agent('atlas').cash,preferred:chooseExpansionType(agent('atlas')),buyerBuildings:agent('atlas').buildings.length,sellerBuildings:agent('mercure').buildings.map(b=>b.type),sellers:AI_IDS.filter(id=>id!=='atlas'&&agent(id)?.buildings.length>1)})");
 assert.equal(g.run("aiAcquireBuilding('atlas')"),true,JSON.stringify(details));
 assert.equal(g.run("agent('atlas').buildings.some(b=>b.id==='mercure-extra')"),true);
 assert.equal(g.run("agent('mercure').cash"),before+250);
});

test('un professeur et un proviseur préexistent',()=>{
 const g=game();
 assert.equal(g.run("activeSchoolStaff('teacher').length"),1);
 assert.equal(g.run("activeSchoolStaff('principal').length"),1);
});
test('un professeur formé peut enseigner et augmenter les places',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("agent('player').stock.wood=20;agent('player').stock.ore=10;state.selected=60;build('school');agent('player').cash=500");
 const id=g.run("candidates().find(w=>w.qualification==='worker').id");
 g.run("trainWorker('"+id+"','teacher');trainingCycle();trainingCycle();appointSchoolStaff('"+id+"','teacher')");
 assert.equal(g.run("activeSchoolStaff('teacher').length"),2);
 assert.equal(g.run("availableSchoolSeats()"),4);
});
test('le proviseur est nécessaire pour recruter les cadres',()=>{
 const g=game();g.run("startGame('farm')");
 const id=g.run("candidates().find(w=>w.qualification==='worker').id");
 g.run("state.workers.find(w=>w.id==='"+id+"').qualification='hr';state.workers.find(w=>w.schoolRole==='principal').schoolRole=null");
 g.run("recruitExecutive('"+id+"','hr')");
 assert.equal(g.run("agent('player').managers.hr.length"),0);
 g.run("state.workers.find(w=>w.qualification==='principal').schoolRole='principal';recruitExecutive('"+id+"','hr')");
 assert.equal(g.run("agent('player').managers.hr.length"),1);
});

test('page Effectifs : bâtiments, salariés et postes vacants',()=>{
 const g=game();g.run("startGame('farm');tab('staff')");
 assert.match(g.ctx.document.getElementById('staffSummary').innerHTML,/0 \/ 3/);
 assert.match(g.ctx.document.getElementById('staffBuildings').innerHTML,/Ferme/);
 g.run("agent('player').buildings[0].wage=60");
 const id=g.run("candidates().find(w=>w.qualification==='worker').id");
 g.run("hireWorker('player','"+id+"','player-1');tab('staff')");
 assert.match(g.ctx.document.getElementById('staffSummary').innerHTML,/1 \/ 3/);
 assert.match(g.ctx.document.getElementById('staffBuildings').innerHTML,new RegExp(id));
 assert.match(g.ctx.document.getElementById('staffSchool').innerHTML,/Professeurs : 1/);
});
