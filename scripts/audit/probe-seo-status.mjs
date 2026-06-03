import { chromium } from 'playwright';
const BASE='https://pmhnphiring.com';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const urls=[
  // valid — expect 200
  '/jobs/remote', '/jobs/telehealth', '/jobs/state/california', '/jobs/remote/california',
  // garbage single-segment /jobs/* — the S1 bug (should be 410/404, prob 200)
  '/jobs/totally-not-a-category-zzz', '/jobs/fake-cat-abc123',
  // dead job (UUID) — expect 410
  '/jobs/x-12345678-1234-1234-1234-123456789012',
  // pSEO invalid state/city — expect 410 per middleware
  '/jobs/remote/not-a-real-state-zzz', '/jobs/remote/city/not-a-real-city-zzz', '/jobs/va/city/not-a-real-city-zzz',
  // metro
  '/jobs/metro/new-york-ny', '/jobs/metro/not-a-metro-zzz',
  // companies
  '/companies', '/companies/not-a-real-company-zzz',
  // top-level garbage — Next default
  '/totally-random-page-zzz', '/blog/not-a-real-post-zzz',
  // trailing slash variant of the bug
  '/jobs/totally-not-a-category-zzz/',
];
const b=await chromium.launch({headless:true});
const c=await b.newContext({userAgent:UA});
const rows=[];
for(const u of urls){
  const page=await c.newPage();
  try{
    const r=await page.goto(BASE+u,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(500);
    const noindex=await page.$eval('meta[name="robots"]',m=>m.content).catch(()=>'-');
    const txt=(await page.evaluate(()=>document.body.innerText||'')).replace(/\s+/g,' ').toLowerCase();
    const notFoundBody=/not found|no longer available|position removed|doesn.?t exist/.test(txt.slice(0,300));
    rows.push({u,status:r?.status(),noindex,notFoundBody});
  }catch(e){rows.push({u,status:'ERR',err:String(e).slice(0,60)});}
  await page.close();
}
await b.close();
console.log('PATH | STATUS | NOINDEX | not-found-body?');
for(const r of rows) console.log(`${r.u} | ${r.status} | ${r.noindex} | ${r.notFoundBody??r.err??''}`);
