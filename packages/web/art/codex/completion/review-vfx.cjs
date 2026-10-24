// Requires Playwright (or PLAYWRIGHT_MODULE), Chromium, and a repo-root HTTP server.
// Example: python3 -m http.server 8765 --bind 127.0.0.1
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const repo=path.resolve(__dirname,'../../../../..');
const expected=Number(process.argv[2]||50);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
  await page.goto((process.env.REVIEW_URL||'http://127.0.0.1:8765')+'/docs/art/spell-effects.html');
  await page.waitForFunction(n=>window.vfxReview?.loaded===n||window.vfxReview?.errors.length>0,expected);
  await page.waitForFunction(()=>window.vfxReview.entries.every(e=>window.vfxReview.draws[e.id]?.length===e.vfx.frames));
  const playback=await page.evaluate(()=>({loaded:window.vfxReview.loaded,errors:window.vfxReview.errors,framesDrawn:window.vfxReview.draws}));
  if(playback.loaded!==expected||playback.errors.length||errors.length||failed.length)throw Error(JSON.stringify({playback,errors,failed}));
  await page.evaluate(()=>window.vfxReview.setFrame(3));
  await page.screenshot({path:path.join(repo,'docs/art/spell-effects-browser-dark.png'),fullPage:true});
  await page.evaluate(()=>window.vfxReview.setBackground('#eeeeee'));
  await page.screenshot({path:path.join(repo,'docs/art/spell-effects-browser-light.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Horizontal overflow on mobile');
  // Phaser smoke: load the same sheets and create/play the engine's animations.
  await page.addScriptTag({url:'/node_modules/phaser/dist/phaser.js'});
  const phaser=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const entries=window.vfxReview.entries,loadErrors=[],played=new Set();
   const game=new Phaser.Game({type:Phaser.CANVAS,width:64,height:64,audio:{noAudio:true},banner:false,
    scene:{preload(){this.load.on('loaderror',f=>loadErrors.push(f.key));for(const e of entries)this.load.spritesheet(e.id,'../../packages/web/public/assets/'+e.vfx.file,{frameWidth:e.vfx.frameWidth,frameHeight:e.vfx.frameHeight})},
     create(){
      for(const e of entries){const v=e.vfx;if(this.textures.get(e.id).frameTotal!==v.frames+1){reject(Error('Phaser frame count: '+e.id));game.destroy(true);return}
       this.anims.create({key:e.id,frames:this.anims.generateFrameNumbers(e.id,{start:0,end:v.frames-1}),frameRate:v.fps,repeat:v.role==='projectile'?-1:0});
       const sprite=this.add.sprite(32,32,e.id).play(e.id);sprite.on('animationupdate',()=>played.add(e.id));
      }
      this.time.delayedCall(800,()=>{const result={textures:entries.length,animated:played.size,loadErrors};game.destroy(true);resolve(result)});
     }} });
   setTimeout(()=>reject(Error('Phaser smoke timed out')),15000);
  }));
  if(phaser.animated!==expected||phaser.loadErrors.length)throw Error(JSON.stringify(phaser));
  const result={passed:true,expected,...playback,phaser,mobileOverflow:overflow,pageErrors:errors,failedRequests:failed,
    scope:'Standalone animation viewer and Phaser texture/playback smoke; not live battle acceptance'};
  fs.writeFileSync(path.join(repo,'docs/art/spell-effects-browser-check.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({passed:true,effects:playback.loaded,phaser,mobileOverflow:overflow}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
