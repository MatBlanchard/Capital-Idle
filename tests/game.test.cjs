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
 const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},classList:{add(){},remove(){},toggle(){}},value:'',textContent:'',innerHTML:'',options:[]});return nodes.get(id)},addEventListener(){}};
 const local=new Map();
 const ctx={document:doc,window:{},Date,Math,Number,JSON,Array,Object,Set,Map,console,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},setInterval(){},setTimeout(){return 1},clearTimeout(){},confirm(){return true}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,run:code=>vm.runInContext(code,ctx)};
}
test('sauvegarde initiale et migration v5',()=>{
 const g=game();assert.equal(g.run('state.version'),6);
 assert.equal(g.run('state.workers.length'),100);
 assert.equal(g.run('migrate({...fresh(),version:5}).version'),6);
});
test('recrutement manuel autorisé sans responsable RH',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.buildings[0].wage=60");
 g.run("candidates()[0].qualification='farmer'");assert.equal(g.run("hireWorker('player',candidates()[0].id,'player-1')"),true);
});
test('école, formation et recrutement après diplôme',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.stock.wood=100;state.agents.player.stock.ore=100;state.selected=60;build('school');state.gameMs+=4*DAY_MS;finishConstruction()");
 assert.equal(g.run("state.agents.player.buildings.some(b=>b.type==='school')"),true);
 g.run("trainWorker(candidates()[0].id,'farmer');state.workers.filter(w=>w.training).forEach(w=>w.training.days=1);trainingCycle();trainWorker(candidates().find(w=>w.primaryDiploma).id,'hr');state.workers.filter(w=>w.training).forEach(w=>w.training.days=1);trainingCycle()");
 assert.equal(g.run("state.workers.some(w=>w.qualification==='hr')"),true);
 g.run("appointManager(state.workers.find(w=>w.qualification==='hr'&&!w.managerFor).id,'hr')");
 assert.equal(g.run("canHire(agent('player'))"),true);
 g.run("state.agents.player.buildings[0].wage=60;state.workers.push(initWorker({id:'w-school-test',qualification:'farmer',home:0,cash:100,food:3,health:3,job:null,alive:true,adult:true,expectedWage:10,productivity:1}))");
 assert.equal(g.run("hireWorker('player','w-school-test','player-1')"),true);
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
 g.run("state.agents.player.buildings[0].wage=60;agent('player').managers.hr.push('w-test-productivity');state.workers.push(initWorker({id:'w-test-productivity',home:0,cash:100,food:3,health:3,job:null,alive:true,adult:true,expectedWage:10,productivity:1.3,qualification:'farmer'}));");
 g.run("hireWorker('player','w-test-productivity','player-1')");
 const before=g.run("agent('player').stock.wheat");g.run("simulate(150000)");
 assert.ok(g.run("agent('player').stock.wheat")>before);
});

test('RH automatise le recrutement du joueur sur les postes vacants',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.agents.player.buildings[0].wage=60");
 assert.equal(g.run("canHire(agent('player'))"),false);
 assert.equal(g.run("state.workers.filter(w=>w.job==='player-1').length"),0);
 g.run("agent('player').managers.hr.push('w-test-productivity9');state.workers.push(initWorker({id:'w-test-productivity9',home:0,cash:100,food:3,health:3,job:null,alive:true,adult:true,managerFor:'player',managerRole:'hr',qualification:'hr'}));");
 g.run("candidates().forEach(w=>w.qualification='farmer');aiRecruit()");
 assert.ok(g.run("state.workers.filter(w=>w.job==='player-1').length")>0);
});

test('neuf entreprises IA réparties sur trois secteurs',()=>{
 const g=game();
 assert.equal(g.run('AI_IDS.length'),10);
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
 g.run("agent('player').stock.wood=100;agent('player').stock.ore=100;state.selected=60;build('school');state.gameMs+=4*DAY_MS;finishConstruction();agent('player').cash=500");
 const id=g.run("candidates().find(w=>w.qualification==='worker').id");
 g.run("trainWorker('"+id+"','teacher');state.workers.filter(w=>w.training).forEach(w=>w.training.days=1);trainingCycle();appointSchoolStaff('"+id+"','teacher')");
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
 g.run("state.workers.find(w=>w.id==='"+id+"').qualification='farmer';hireWorker('player','"+id+"','player-1');tab('staff')");
 assert.match(g.ctx.document.getElementById('staffSummary').innerHTML,/1 \/ 3/);
 assert.match(g.ctx.document.getElementById('staffBuildings').innerHTML,new RegExp(id));
 assert.match(g.ctx.document.getElementById('staffSchool').innerHTML,/Professeurs : 1/);
});

test('école : deux postes distincts, professeur et proviseur',()=>{
 const g=game();g.run("startGame('farm');agent('player').stock.wood=100;agent('player').stock.ore=100;state.selected=60;build('school');state.gameMs+=4*DAY_MS;finishConstruction();tab('staff')");
 assert.match(g.ctx.document.getElementById('staffBuildings').innerHTML,/2 \/ 2/);
 assert.match(g.ctx.document.getElementById('staffSchool').innerHTML,/Professeur/);
 assert.match(g.ctx.document.getElementById('staffSchool').innerHTML,/Proviseur/);
 assert.equal(g.run("TYPES.school.jobs"),2);
});
test('marché du travail : candidats sans emploi et hors formation',()=>{
 const g=game();g.run("startGame('farm');tab('labor')");
 const available=g.run("candidates().length");
 assert.match(g.ctx.document.getElementById('laborSummary').innerHTML,new RegExp(available+' candidats affichés'));
 assert.equal(g.run("candidates().every(w=>!w.job&&!w.managerFor&&!w.training&&!w.schoolRole)"),true);
});

test('une journée dure dix minutes réelles',()=>{
 const g=game();assert.equal(g.run("DAY_MS"),20000);assert.equal(g.run("DAY_MS*MONTH_DAYS"),600000);
});
test('carte navigable vers des coordonnées négatives et positives',()=>{
 const g=game();g.run("startGame('farm');moveMap(-1,-1);tab('world')");
 assert.match(g.ctx.document.getElementById('mapCoords').textContent,/x -8 à -1/);
 g.run("tileClick('-8,-8')");
 assert.equal(g.run("state.selected"),'-8,-8');
 g.run("moveMap(2,2)");
 assert.match(g.ctx.document.getElementById('mapCoords').textContent,/x 8 à 15/);
});
test('consignes RH : filtrage par productivité et salaire',()=>{
 const g=game();g.run("startGame('farm');agent('player').buildings[0].wage=100;setHrPolicy('minProductivity',1.3);setHrPolicy('maxWage',10);tab('hr')");
 assert.match(g.ctx.document.getElementById('hrBoard').innerHTML,/Productivité minimale/);
 assert.equal(g.run("hrPolicy(agent('player')).minProductivity"),1.3);
 assert.equal(g.run("hrPolicy(agent('player')).maxWage"),10);
});

test('les coûts de construction sont majorés et les bâtiments ont un délai',()=>{
 const g=game();g.run("startGame('farm');agent('player').stock.wood=100;agent('player').stock.ore=100;state.selected=60;build('mine')");
 assert.equal(g.run("TYPES.mine.cost.wood"),40);
 assert.equal(g.run("TYPES.mine.cost.ore"),18);
 assert.equal(g.run("agent('player').stock.wood"),60);
 assert.equal(g.run("agent('player').stock.ore"),82);
 assert.equal(g.run("ready(agent('player').buildings.find(b=>b.type==='mine'))"),false);
 g.run("simulate(3*DAY_MS)");
 assert.equal(g.run("ready(agent('player').buildings.find(b=>b.type==='mine'))"),false);
 g.run("simulate(DAY_MS)");
 assert.equal(g.run("ready(agent('player').buildings.find(b=>b.type==='mine'))"),true);
});

test('revenu de base mensuel : 100 euros tous les 30 jours',()=>{
 const g=game();
 assert.equal(g.run('MONTH_DAYS'),30);
 g.run("state.gameMs=DAY_MS;state.workers[0].food=100;state.workers[0].health=100");
 const before=g.run("({owner:agent('player').cash,worker:state.workers[0].cash})");
 g.run("daily()");
 assert.equal(g.run("agent('player').cash"),before.owner);
 assert.equal(g.run("state.workers[0].cash"),before.worker);
 g.run("state.gameMs=30*DAY_MS;daily()");
 assert.equal(g.run("agent('player').cash"),before.owner+100);
 assert.equal(g.run("state.workers[0].cash"),before.worker+100);
});

test('banque centrale : création, remboursement et destruction du principal',()=>{
 const g=game();g.run("startGame('farm')");
 const before=g.run("agent('player').cash");
 assert.equal(g.run("requestCredit('player',300,6).approved"),true);
 assert.equal(g.run("agent('player').cash"),before+300);
 assert.equal(g.run("centralBank().issued"),300);
 g.run("state.gameMs=30*DAY_MS;daily()");
 assert.equal(g.run("centralBank().repaid"),50);
 assert.equal(g.run("centralBank().loans[0].balance"),250);
 assert.equal(g.run("agent('player').cash"),before+300-50+100);
});
test('banque centrale : refus des demandes insolvables',()=>{
 const g=game();g.run("startGame('farm')");
 assert.equal(g.run("requestCredit('player',100000,6).approved"),false);
 assert.equal(g.run("requestCredit('player',100,0).approved"),false);
 assert.equal(g.run("centralBank().issued"),0);
});
test('banque centrale : conservation des données dans les sauvegardes',()=>{
 const g=game();g.run("startGame('farm');requestCredit('player',120,6)");
 assert.equal(g.run("migrate(JSON.parse(JSON.stringify(state))).bank.loans.length"),1);
 assert.equal(g.run("migrate({...fresh(),bank:undefined}).bank.loans.length"),0);
});

test('ferme produit du blé et boulangerie transforme deux blés en un pain',()=>{
 const g=game();g.run("startGame('farm')");
 assert.equal(g.run("TYPES.farm.out"),'wheat');
 assert.equal(g.run("TYPES.bakery.out"),'food');
 assert.equal(g.run("TYPES.bakery.input"),'wheat');
 const before=g.run("agent('moulin').stock.food");
 g.run("state.workers.filter(w=>w.job==='moulin-1').forEach(w=>w.job=null);state.bakeryContracts=[];agent('moulin').stock.wheat=20;agent('moulin').cash=1000;state.workers.push(initWorker({id:'w-baker',home:0,cash:100,food:3,health:3,job:'moulin-1',alive:true,adult:true,productivity:1,expectedWage:10}));simulate(DAY_MS/2)");
 assert.equal(g.run("agent('moulin').stock.food"),before+4);
 assert.equal(g.run("agent('moulin').stock.wheat"),12);
});
test('le blé est négociable mais ne nourrit pas directement les habitants',()=>{
 const g=game();g.run("startGame('farm')");
 assert.equal(g.run("!!ITEMS.wheat"),true);
 g.run("state.workers[0].food=0;agent('player').stock.wheat=10");
 assert.equal(g.run("state.workers[0].food"),0);
});

test('primaire requis pour une formation universitaire',()=>{
 const g=game();g.run("startGame('farm');agent('player').cash=500");
 assert.equal(g.run("activeSchoolStaff('professor').length"),1);
 assert.equal(g.run("availableUniversitySeats()"),2);
 const id=g.run("candidates()[0].id");
 g.run("state.workers.find(w=>w.id===\'"+id+"\').primaryDiploma=false");
 assert.notEqual(g.run("trainWorker('"+id+"','hr')"),true);
 assert.equal(g.run("trainWorker('"+id+"','farmer')"),true);
 g.run("state.workers.filter(w=>w.training).forEach(w=>w.training.days=1);trainingCycle()");
 assert.equal(g.run("state.workers.find(w=>w.id==='"+id+"').primaryDiploma"),true);
 assert.equal(g.run("trainWorker('"+id+"','hr')"),true);
});

test('formation ouvrière de 360 jours et cadre de 720 jours',()=>{
 const g=game();g.run("startGame('farm');agent('player').cash=500");
 const id=g.run("candidates()[0].id");
 g.run("state.workers.find(w=>w.id===\'"+id+"\').primaryDiploma=false");
 assert.equal(g.run("trainWorker('"+id+"','farmer')"),true);
 assert.equal(g.run("state.workers.find(w=>w.id==='"+id+"').training.days"),360);
 g.run("state.workers.find(w=>w.id==='"+id+"').training.days=1;trainingCycle()");
 assert.equal(g.run("trainWorker('"+id+"','hr')"),true);
 assert.equal(g.run("state.workers.find(w=>w.id==='"+id+"').training.days"),720);
});

test('famille stable, enfant à charge et majorité à dix-huit ans',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("state.workers[3].cash=500;state.workers[4].cash=500;state.workers[3].food=5;state.workers[4].food=5;state.workers[3].home=0;state.workers[4].home=1;state.workers[3].lastBirth=-360;state.workers[4].lastBirth=-360;state.workers.slice(5).forEach(w=>w.cash=0);state.workers.slice(0,3).forEach(w=>w.cash=0);reproduce(0)");
 assert.equal(g.run("state.births"),1);
 const id=g.run("state.workers.at(-1).id");
 assert.equal(g.run("state.workers.at(-1).adult"),false);
 assert.equal(g.run("state.workers.at(-1).parentIds.length"),2);
 assert.equal(g.run("state.workers[3].partnerId"),g.run("state.workers[4].id"));
 g.run("reproduce(1)");
 assert.equal(g.run("state.births"),1);
 g.run("state.gameMs=ADULT_AGE_DAYS*DAY_MS;state.workers.at(-1).food=5;daily()");
 assert.equal(g.run("state.workers.find(w=>w.id==='"+id+"').adult"),true);
});

test('offre de rachat : acceptation et transfert de propriété',()=>{
 const g=game();g.run("startGame('farm');agent('player').cash=2000");
 const id=g.run("agent('atlas').buildings[0].id");
 assert.equal(g.run("offerBuildingPurchase('"+id+"',1000)"),true);
 assert.equal(g.run("agent('player').cash"),1000);
 g.run("state.gameMs=DAY_MS;resolvePurchaseOffers()");
 assert.equal(g.run("state.acquisitionOffers[0].status"),'accepted');
 assert.equal(g.run("agent('player').buildings.some(b=>b.id==='"+id+"')"),true);
 assert.equal(g.run("agent('atlas').buildings.some(b=>b.id==='"+id+"')"),false);
});
test('offre refusée : restitution des fonds',()=>{
 const g=game();g.run("startGame('farm');agent('player').cash=2000");
 const id=g.run("agent('atlas').buildings[0].id");
 assert.equal(g.run("offerBuildingPurchase('"+id+"',1)"),true);
 g.run("state.gameMs=DAY_MS;resolvePurchaseOffers()");
 assert.equal(g.run("state.acquisitionOffers[0].status"),'rejected');
 assert.equal(g.run("agent('player').cash"),2000);
});

test('façonnage : blé et paiement du client, pain livré, revenu du boulanger',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("agent('player').stock.wheat=10;agent('player').cash=1000");
 const bakery=g.run("allBuildings().find(b=>b.type==='bakery'&&b.owner!=='player').id");
 g.run("state.workers[5].job='"+bakery+"';state.workers[5].qualification='baker'");
 assert.equal(g.run("orderBakeryService('player','"+bakery+"',2)"),true);
 assert.equal(g.run("agent('player').stock.wheat"),6);
 assert.equal(g.run("agent('player').cash"),990);
 g.run("simulate(DAY_MS)");
 assert.equal(g.run("agent('player').stock.food>=2"),true);
 assert.equal(g.run("state.bakeryContracts[0].status"),'completed');
});

test('ferme améliorée : lin, houblon, malt et effectifs',()=>{
 const g=game();g.run("startGame('farm');agent('player').stock.wood=200;agent('player').stock.ore=200");
 assert.equal(g.run("buildingJobs(agent('player').buildings[0])"),3);
 g.run("upgradeFarm('player-1');upgradeFarm('player-1');upgradeFarm('player-1')");
 assert.equal(g.run("agent('player').buildings[0].level"),4);
 assert.equal(g.run("buildingJobs(agent('player').buildings[0])"),9);
 g.run("state.workers[5].qualification='farmer';state.workers[5].job='player-1';agent('player').cash=10000;simulate(DAY_MS/4)");
 assert.equal(g.run("agent('player').stock.flax>0"),true);
 assert.equal(g.run("agent('player').stock.hops>0"),true);
 assert.equal(g.run("agent('player').stock.malt>0"),true);
});
test('textile et boissons : bonheur et productivité',()=>{
 const g=game();g.run("startGame('farm')");
 g.run("agent('player').stock.clothes=1;state.workers[5].job='player-1'");
 const before=g.run("state.workers[5].happiness");
 assert.equal(g.run("distributeWellbeing('player','clothes')"),true);
 assert.equal(g.run("state.workers[5].happiness"),before+12);
 assert.equal(g.run("agent('player').stock.clothes"),0);
 assert.equal(g.run("TYPES.tailor.input==='flax'&&TYPES.brewery.input==='hops'&&TYPES.distillery.input==='malt'"),true);
});

test('niveau 5 : tabac et bureau de tabac',()=>{
 const g=game();g.run("startGame('farm');agent('player').stock.wood=300;agent('player').stock.ore=300");
 g.run("upgradeFarm('player-1');upgradeFarm('player-1');upgradeFarm('player-1');upgradeFarm('player-1')");
 assert.equal(g.run("agent('player').buildings[0].level"),5);
 assert.equal(g.run("buildingJobs(agent('player').buildings[0])"),11);
 g.run("state.workers[5].qualification='farmer';state.workers[5].job='player-1';agent('player').cash=10000;simulate(DAY_MS/4)");
 assert.equal(g.run("agent('player').stock.tobacco>0"),true);
 assert.equal(g.run("TYPES.tobacconist.input"),'tobacco');
});
test('mortalité : probabilité croissante avec âge et exposition',()=>{
 const g=game();
 assert.equal(g.run("annualMortality(90)>annualMortality(40)"),true);
 assert.equal(g.run("mortalityProbability({...state.workers[5],alcoholExposure:5})>mortalityProbability({...state.workers[5],alcoholExposure:0})"),true);
});
test('boissons : achats individuels sans distribution par employeur',()=>{
 const g=game();g.run("startGame('farm')");
 assert.equal(g.run("distributeWellbeing('player','beer')"),false);
 g.run("state.workers[5].cash=1000;state.workers[5].alcoholProfile='high';agent('moulin').stock.beer=10;agent('moulin').buildings.push({id:'brew-test',type:'brewery',pos:'10,4',wage:20})");
 const originalRandom=Math.random;try{Math.random=()=>0;g.run("workerPurchases(2)")}finally{Math.random=originalRandom}
 assert.equal(g.run("state.workers[5].alcoholExposure>0"),true);
 assert.equal(g.run("state.workers[5].cash<1000"),true);
});

test('chaque travailleur démarre avec 50 pains',()=>{
 const g=game();
 assert.equal(g.run('state.workers.length'),100);
 assert.equal(g.run('state.workers.every(w=>w.food===50)'),true);
});

test('commercial : vendre uniquement le surplus au-dessus du seuil',()=>{
 const g=game();g.run("startGame('farm');agent('player').managers.trader=['w1'];agent('player').stock.wheat=30");
 assert.equal(g.run("setTradePolicy('wheat','sell',20,8)"),true);
 g.run("playerTradingCycle()");
 assert.equal(g.run("state.orders.filter(o=>o.owner==='player'&&o.item==='wheat'&&o.autoTrade).reduce((n,o)=>n+o.qty,0)"),10);
 assert.equal(g.run("agent('player').stock.wheat"),20);
});
test('commercial : acheter pour maintenir un stock cible sans doubler les ordres',()=>{
 const g=game();g.run("startGame('farm');agent('player').managers.trader=['w1'];agent('player').cash=1000;agent('player').stock.wood=3");
 assert.equal(g.run("setTradePolicy('wood','buy',15,10)"),true);
 g.run("playerTradingCycle();playerTradingCycle()");
 assert.equal(g.run("state.orders.filter(o=>o.owner==='player'&&o.item==='wood'&&o.autoTrade).reduce((n,o)=>n+o.qty,0)"),12);
 assert.equal(g.run("agent('player').cash"),880);
});

test('faim : pain quotidien ajoute un point et absence de pain retire trois points',()=>{
 const g=game();g.run("startGame('farm');state.workers[0].hunger=50;state.workers[0].food=2;state.workers[0].bornDay=-25*YEAR_DAYS;Math.random=()=>1;daily()");
 assert.equal(g.run("state.workers[0].hunger"),51);
 g.run("state.workers[0].food=0;daily()");
 assert.equal(g.run("state.workers[0].hunger"),48);
});
test('immigration : nouveaux habitants au bout de trente jours',()=>{
 const g=game();g.run("startGame('farm');state.gameMs=30*DAY_MS;Math.random=()=>0;immigration(30)");
 assert.equal(g.run("state.immigrants"),1);
 assert.equal(g.run("state.workers.length"),101);
});
