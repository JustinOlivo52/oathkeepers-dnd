const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const report=[];
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/docs/art/library-batch-2-complete.html');await page.waitForFunction(()=>window.review?.ready);
  for(const animation of ['idle','walk','attack','hit','down']){await page.selectOption('#animation',animation);await page.waitForTimeout(220);const populated=await page.locator('canvas').evaluateAll(cs=>cs.every(c=>{const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return pixels.some((v,i)=>i%4===3&&v>0)}));if(!populated)throw Error('Empty '+animation+' canvas')}
  await page.click('#mirror');await page.click('#pause');await page.click('#step');
  const evidence=await page.evaluate(()=>({...window.review,overflow:document.documentElement.scrollWidth>innerWidth}));
  if(errors.length||evidence.errors.length||evidence.overflow)throw Error(JSON.stringify({errors,evidence}));
  await page.screenshot({path:`docs/art/library-batch-2-complete-${viewport.width}.png`,fullPage:true});
  report.push({viewport,...evidence,pageErrors:errors});await page.close();
 }
 fs.writeFileSync('docs/art/library-batch-2-complete-browser-check.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
