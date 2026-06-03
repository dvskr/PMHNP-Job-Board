import { chromium } from 'playwright';
const BASE='https://pmhnphiring.com';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const probes=[
  '/jobs/fake-job-12345678-1234-1234-1234-123456789012', // looks like detail w/ non-existent UUID
  '/jobs/totally-garbage-no-uuid-zzz',                    // no UUID at all
  '/jobs/this-page-does-not-exist-xyz',                   // audit's original probe
];
const b=await chromium.launch({headless:true});
const c=await b.newContext({userAgent:UA});
for(const p of probes){
  const page=await c.newPage();
  try{
    const r=await page.goto(BASE+p,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(800);
    const title=await page.title().catch(()=>'');
    const noindex=await page.$eval('meta[name="robots"]',m=>m.content).catch(()=>null);
    const txt=(await page.evaluate(()=>document.body.innerText)).slice(0,140).replace(/\s+/g,' ');
    console.log(JSON.stringify({path:p,status:r?.status(),title:title.slice(0,60),noindex,bodyStart:txt}));
  }catch(e){console.log(JSON.stringify({path:p,error:String(e).slice(0,120)}));}
  await page.close();
}
await b.close();
