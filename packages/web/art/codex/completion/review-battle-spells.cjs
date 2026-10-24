// Real app UI plus deterministic engine casts played by the production BattleScene.
// Run Vite first. Requires Playwright/Chromium; no AI service or paid calls.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'../../../../..');
const base=process.env.BATTLE_REVIEW_URL||'http://127.0.0.1:5173';
const screenshotsOnly=process.argv.includes('--screenshots-only');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[],badAssets=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message)});
  page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)badAssets.push(r.url())});
  await page.route('**/api/health',r=>r.fulfill({status:404,body:'{"ok":false}'}));
  await page.addInitScript(()=>localStorage.setItem('oathkeepers.autoEndTurn','0'));
  await page.goto(base);await page.getByRole('button',{name:'Battle',exact:true}).click();
  await page.locator('.encounter-options select').first().selectOption('pip-thistlewick');
  await page.getByRole('button',{name:'Start battle',exact:true}).click();
  await page.waitForFunction(()=>window.oathkeepersBattle?.scene?.textures.exists('vfx-vampiric-touch'));
  await page.waitForFunction(()=>document.querySelectorAll('button.spell img').length>0);
  const setup=await page.evaluate(async repo=>{
   const controller=window.oathkeepersBattle,originalScene=controller.scene;
   const {content}=await import('/src/content.ts');
   const engine=await import('/@fs'+repo+'/packages/engine/src/index.ts');
   const {BattleScene,TILE}=await import('/src/battle/scene.ts');
   const {spriteFor,tilesetFor}=await import('/src/battle/battlefields.ts');
   const spells=content.spells.map(s=>({...s,attackBonus:100,saveDc:20}));
   const hero=controller.combat.get([...controller.playerIds][0]);
   hero.spells=spells;controller.refresh();
   window.battleSpellReview={errors:[],cases:[],covered:new Set(),spells,engine,TILE};
   const state=window.battleSpellReview;
   const originalHero=structuredClone(hero);
   const slots=()=>Object.fromEntries([1,2,3].map(n=>['spell-slot-'+n,{current:99,max:99,recharge:'long'}]));
   const make=o=>({...structuredClone(originalHero),effects:[],features:[],attacks:[{id:'review-sword',name:'Review sword',kind:'melee',attackBonus:100,damage:'1d6',damageType:'slashing',reachFt:5}],conditions:[],resistances:[],vulnerabilities:[],immunities:[],
    resources:slots(),spells,dead:false,stable:false,tempHp:0,deathSaves:{successes:0,failures:0},maxHp:1000,hp:500,initiativeBonus:0,...o});
   const caster=make({id:'review-caster',name:'Review caster',position:{x:8,y:6},initiativeBonus:100});
   const ally=make({id:'review-ally',name:'Review ally',position:{x:8,y:7}});
   const foe=make({id:'review-target',name:'Review target',side:'enemies',kind:'monster',monsterId:'goblin-warrior',creatureType:'humanoid',position:{x:9,y:6},ac:1,hp:1000});
   const map=engine.GridMap.parse(Array.from({length:14},()=>'.'.repeat(22)));
   const Game=originalScene.game.constructor;
   // Keep the actual spell panel for the icon check; the fixture board is labeled explicitly.
   const panel=document.createElement('section');panel.id='spell-review-fixture';panel.style='background:#182026;color:#eee;padding:12px;margin:20px';
   const label=document.createElement('h2');label.textContent='Deterministic live battle integration review';panel.append(label);
   const host=document.createElement('div');panel.append(host);document.body.prepend(panel);
   const vfx=content.art.filter(e=>e.kind==='vfx').map(e=>({key:e.id,...e.vfx}));
   const scene=new BattleScene(map,[caster,ally,foe],c=>spriteFor(c,'arcane',c.monsterId,c.id==='review-caster'?'wizard':undefined),tilesetFor('tiles-abbey'),{onHover(){},onClick(){},onLoadError(){state.errors.push('Asset load error')}},vfx);
   new Game({type:2,parent:host,width:1120,height:720,backgroundColor:'#101719',scene,banner:false,audio:{noAudio:true}});
   await Promise.race([scene.whenReady,new Promise((_,reject)=>setTimeout(()=>reject(Error('BattleScene initialization timed out')),15000))]);scene.fitBoard();state.scene=scene;
   let activeCase;
   const add=scene.add.sprite.bind(scene.add);
   scene.add.sprite=(...args)=>{const sprite=add(...args);if(String(args[2]).startsWith('vfx-')){
    let recorded=false;const record=()=>{if(!sprite.active||recorded)return;recorded=true;
     const row={key:sprite.texture.key,rotation:sprite.rotation,flipX:sprite.flipX,masked:!!sprite.mask,width:sprite.displayWidth,height:sprite.displayHeight,x:sprite.x,y:sprite.y};
     state.covered.add(row.key);activeCase?.art.push(row)};
    scene.events.once('postupdate',record);
   }return sprite};
   state.run=async options=>{
    const spell=options.spell||spells.find(s=>s.id===options.id);if(!spell)throw Error('Unknown spell');
    const foePosition=options.direction==='north'?{x:8,y:3}:options.direction==='diagonal'?{x:11,y:3}:{x:9,y:6};
    Object.assign(caster,make({id:'review-caster',name:'Review caster',position:{x:8,y:6},initiativeBonus:100,spells:[...spells,spell]}));
    Object.assign(ally,make({id:'review-ally',name:'Review ally',position:{x:8,y:7},...(spell.effect==='revivify'?{dead:true,hp:0}:{})}));
    Object.assign(foe,make({id:'review-target',name:'Review target',side:'enemies',kind:'monster',monsterId:'goblin-warrior',creatureType:'humanoid',position:foePosition,ac:1,hp:1000,
     ...(spell.id==='chromatic-orb'?{resistances:['fire'],vulnerabilities:['cold']}:{})}));
    for(const c of [caster,ally,foe]){
     const t=scene.tokens.get(c.id);t.hp=c.hp;t.dead=c.dead;t.sprite.setPosition((c.position.x+.5)*TILE,(c.position.y+1)*TILE-TILE*.22).setAlpha(1).clearTint().play(t.sheet.key+':idle');
    }
    scene.syncGuardianAuras();scene.fitBoard();
    const combat=new engine.Combat([caster,ally,foe],engine.scriptedRng(Array(1000).fill(options.miss?1:15)),new engine.EventLog(),map);combat.start();
    while(combat.current.id!==caster.id)combat.endTurn();
    const before=combat.log.events.length;
    const opts=spell.target==='enemy'?{targetIds:[foe.id]}:spell.target==='ally'?{targetIds:[ally.id]}:spell.target==='point'?{point:spell.effect==='teleport'?{x:10,y:7}:foe.position}:{};
    if(options.slot)opts.slotLevel=options.slot;
    activeCase={id:spell.id,direction:options.direction||'east',art:[]};state.current=activeCase;label.textContent='Live battle review: '+spell.name;
    combat.castSpell(caster.id,spell.id,opts);
    const events=combat.log.events.slice(before);await scene.play(events);
    if(options.miss&&activeCase.art.some(e=>e.key==='vfx-fire'))throw Error('Miss incorrectly showed a damage impact');
    if(spell.smite||spell.effect==='divine-favor'){
     const from=combat.log.events.length;combat.attack(caster.id,foe.id,'review-sword');await scene.play(combat.log.events.slice(from));
     if(activeCase.art.filter(e=>e.key==='vfx-'+spell.id).length<2)throw Error('Weapon rider impact absent');
     activeCase.weaponRiderReviewed=true;
    }
    if(spell.id==='chromatic-orb'&&!activeCase.art.some(e=>e.key==='vfx-cold-projectile'))throw Error('Chromatic Orb did not use resolved cold art');
    if(spell.effect==='vampiric'&&(!activeCase.art.some(e=>e.key==='vfx-vampiric-touch')||!activeCase.art.some(e=>e.key==='vfx-heal')))throw Error('Vampiric damage/heal feedback missing');
    if(spell.effect==='teleport'){
     const token=scene.tokens.get(caster.id);if(token.sprite.alpha!==1||Math.abs(token.sprite.x-10.5*TILE)>1)throw Error('Teleport not restored at destination');
    }
    if(spell.effect==='spirit-guardians'){
     if(scene.guardianAuras.size!==1)throw Error('Guardian aura missing');
     let from=combat.log.events.length;combat.move(caster.id,[{x:7,y:6}]);await scene.play(combat.log.events.slice(from));await new Promise(requestAnimationFrame);
     const aura=scene.guardianAuras.get(caster.id),token=scene.tokens.get(caster.id);
     if(Math.abs(aura.x-token.sprite.x)>1)throw Error('Guardian aura did not follow movement');
     from=combat.log.events.length;combat.endTurn();while(combat.current.id!==foe.id)combat.endTurn();await scene.play(combat.log.events.slice(from));
     if(!combat.log.ofType('damage').some(e=>e.spellId==='spirit-guardians'))throw Error('Guardian ongoing damage absent');
     from=combat.log.events.length;combat.endTurn();while(combat.current.id!==caster.id)combat.endTurn();combat.castSpell(caster.id,'bless',{targetIds:[ally.id]});await scene.play(combat.log.events.slice(from));
     if(scene.guardianAuras.size)throw Error('Guardian aura survived concentration replacement');
     activeCase.guardianMoveDamageAndCleanup=true;
    }
    if(spell.area){const art=activeCase.art.find(e=>e.masked);if(!art)throw Error('Area was not masked to affected squares');
     if(options.direction==='north'&&['line','cone'].includes(spell.area.shape)&&Math.abs(art.rotation+Math.PI/2)>.02)throw Error('Northward art not rotated');
     if(options.direction==='diagonal'&&['line','cone'].includes(spell.area.shape)&&Math.abs(art.rotation+Math.PI/4)>.02)throw Error('Diagonal art not rotated');
    }
    if(spell.id==='magic-missile'&&options.slot===3&&activeCase.art.filter(e=>e.key==='vfx-magic-missile-projectile').length!==5)throw Error('Upcast dart count incorrect');
    state.cases.push(activeCase);return activeCase;
   };
   return {spells:spells.map(s=>s.id),assets:vfx.length};
  },repo);
  await page.waitForFunction(()=>document.querySelectorAll('button.spell img').length===40&&[...document.querySelectorAll('button.spell img')].every(i=>i.complete&&i.naturalWidth===64));
  const iconCount=await page.locator('button.spell img').count();
  await page.screenshot({path:path.join(repo,'docs/art/spell-battle-icons.jpg'),fullPage:true,type:'jpeg',quality:90});
  if(!screenshotsOnly)for(const id of setup.spells){
   await page.evaluate(id=>window.battleSpellReview.run({id}),id);console.log('Reviewed',id);
  }
  if(!screenshotsOnly)for(const id of ['lightning-bolt','burning-hands'])for(const direction of ['north','diagonal'])await page.evaluate(o=>window.battleSpellReview.run(o),{id,direction});
  if(!screenshotsOnly)await page.evaluate(()=>window.battleSpellReview.run({id:'magic-missile',slot:3}));
  if(!screenshotsOnly)for(const type of ['fire','cold','lightning','acid','poison','necrotic','radiant','force','thunder','psychic']){
   await page.evaluate(type=>window.battleSpellReview.run({spell:{id:'review-'+type,name:type+' fallback',level:0,castingTime:'action',rangeFt:120,target:'enemy',attack:'ranged',damage:{dice:'1d6',type},attackBonus:100,saveDc:20}}),type);
  }
  if(!screenshotsOnly)await page.evaluate(()=>window.battleSpellReview.run({id:'fire-bolt',miss:true}));
  for(const [id,direction,key,file] of [
   ['lightning-bolt','north','vfx-lightning-bolt','spell-battle-lightning-north.jpg'],
   ['burning-hands','diagonal','vfx-burning-hands','spell-battle-cone-diagonal.jpg'],
   ['spirit-guardians','east','vfx-spirit-guardians','spell-battle-guardians.jpg'],
   ['vampiric-touch','east','vfx-vampiric-touch','spell-battle-vampiric.jpg'],
   ['magic-missile','east','vfx-magic-missile-projectile','spell-battle-missile.jpg'],
  ]){
   const playing=page.evaluate(o=>window.battleSpellReview.run(o),{id,direction});
   await page.waitForFunction(key=>window.battleSpellReview.scene.children.list.some(s=>s.active&&s.texture?.key===key&&s.anims?.currentFrame?.index>=3),key);
   await page.evaluate(()=>window.battleSpellReview.scene.anims.pauseAll());
   try{await page.locator('#spell-review-fixture').screenshot({path:path.join(repo,'docs/art',file),type:'jpeg',quality:90});}
   finally{await page.evaluate(()=>window.battleSpellReview.scene.anims.resumeAll());}
   await playing;
  }
  const result=await page.evaluate(()=>({passed:true,scope:'Actual app spell panel plus production BattleScene playback of deterministic engine fixtures',
   cases:window.battleSpellReview.cases,covered:[...window.battleSpellReview.covered].sort(),errors:window.battleSpellReview.errors}));
  if(result.errors.length||errors.length||badAssets.length||(!screenshotsOnly&&result.covered.length!==50)||iconCount!==40)throw Error(JSON.stringify({result,errors,badAssets,iconCount}));
  fs.writeFileSync(path.join(repo,'docs/art',screenshotsOnly?'spell-battle-screenshots.json':'spell-battle-check.json'),JSON.stringify({...result,iconCount,pageErrors:errors,failedAssets:badAssets},null,2)+'\n');
  console.log(JSON.stringify({passed:true,spellCases:result.cases.length,coveredAnimations:result.covered.length,iconCount}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
