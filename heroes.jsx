// Five hero layouts for "1099 PMHNP Jobs" listing-page hero.
// All exported to window so the host script can reference them.

const ILLO = 'assets/illustration-cropped.png';

// ─── 01 · Editorial baseline — close to the reference ────────────────────────
function Hero1(){
  return (
    <section className="hero h1">
      <div className="stack">
        <div className="eyebrow">395+ open positions</div>
        <h1 className="display">1099 PMHNP <em>Jobs</em></h1>
        <p className="body">1099 independent contractor PMHNP positions paying $75–$150+/hr with Schedule&nbsp;C tax deductions, flexible caseloads, and no non-compete clauses. Telehealth and in-person roles across private practices, group practices, and staffing agencies.</p>
        <div className="ctas">
          <a className="btn btn-primary" href="#">Browse all 1099 jobs <span className="arr"></span></a>
          <a className="btn btn-ghost" href="#">Set job alert <span className="arr"></span></a>
        </div>
      </div>
      <div className="illo"><img src={ILLO} alt=""/></div>
    </section>
  );
}

// ─── 02 · Full-bleed display — illustration is the canvas ────────────────────
function Hero2(){
  return (
    <section className="hero h2">
      <div className="bg"/>
      <div className="scrim"/>
      <div className="inner">
        <div className="topbar">
          <div className="crumbs">
            <span>Jobs</span><span>Nurse Practitioner</span><span style={{color:'var(--ink)'}}>1099 PMHNP</span>
          </div>
          <div className="filters">
            <span className="pill"><span className="dot"/>Live · 395 roles</span>
            <span className="pill">Telehealth · 247</span>
            <span className="pill">In-person · 148</span>
          </div>
        </div>
        <h1 className="display">Independent. <em>Uncomplicated.</em></h1>
        <div className="meta">
          <p className="body" style={{color:'var(--ink)'}}>1099 contractor PMHNP positions, paid $75–$150+/hr, with Schedule&nbsp;C deductions, flexible caseloads, and zero non-competes — across private, group, and agency practices.</p>
          <div className="stat"><span className="n">395+</span><span className="l">Open</span></div>
          <div className="stat"><span className="n">$112</span><span className="l">Median /hr</span></div>
          <div className="ctas">
            <a className="btn btn-primary" href="#">Browse 1099 jobs <span className="arr"></span></a>
            <a className="btn btn-light" href="#">Set alert <span className="arr"></span></a>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 03 · Magazine grid — newsroom feel, side rail + facts column ────────────
function Hero3(){
  return (
    <section className="hero h3">
      <div className="rail">
        <div>Issue 04<br/>Spring '26</div>
        <div className="vol">Career Desk · 1099 Index</div>
      </div>
      <div className="lede">
        <div className="kicker"><span className="sw"/>395+ Open Positions</div>
        <h1>1099 PMHNP<br/><em>Jobs.</em></h1>
        <p className="deck">Independent contractor positions for psychiatric‑mental health NPs — $75–$150+/hr, Schedule&nbsp;C deductions, flexible caseloads, and no non-competes.</p>
        <div className="ctas">
          <a className="btn btn-primary" href="#">Browse all jobs <span className="arr"></span></a>
          <a className="btn btn-ghost" href="#">Set alert <span className="arr"></span></a>
        </div>
      </div>
      <div className="photo"><img src={ILLO} alt=""/></div>
      <div className="facts">
        <h4>By the numbers</h4>
        <ul>
          <li><span className="num">$75–150</span><span className="lab">/hour pay range<small>Top 10% of postings exceed $165/hr</small></span></li>
          <li><span className="num">247</span><span className="lab">Telehealth roles<small>Plus 148 in-person and hybrid</small></span></li>
          <li><span className="num">0</span><span className="lab">Non-compete clauses<small>Filtered out at posting</small></span></li>
          <li><span className="num">~32%</span><span className="lab">Effective tax savings<small>Schedule C deductions on average</small></span></li>
        </ul>
      </div>
    </section>
  );
}

// ─── 04 · Search-led / interactive ───────────────────────────────────────────
const ALL_JOBS = [
  {role:'PMHNP — Adult Outpatient', loc:'Telehealth · CA', pay:'$135/hr', payN:135, type:'telehealth', setting:'private'},
  {role:'Child & Adolescent PMHNP', loc:'Telehealth · TX', pay:'$150/hr', payN:150, type:'telehealth', setting:'private'},
  {role:'Addiction Medicine PMHNP', loc:'Hybrid · CO', pay:'$120/hr', payN:120, type:'hybrid', setting:'group'},
  {role:'Geriatric PMHNP', loc:'In-person · NY', pay:'$110/hr', payN:110, type:'in-person', setting:'agency'},
  {role:'Outpatient PMHNP', loc:'Telehealth · FL', pay:'$95/hr', payN:95, type:'telehealth', setting:'agency'},
  {role:'Eating Disorders PMHNP', loc:'Hybrid · WA', pay:'$140/hr', payN:140, type:'hybrid', setting:'private'},
  {role:'Trauma & PTSD PMHNP', loc:'Telehealth · IL', pay:'$125/hr', payN:125, type:'telehealth', setting:'group'},
  {role:'Mood Disorders PMHNP', loc:'In-person · MA', pay:'$130/hr', payN:130, type:'in-person', setting:'private'},
];

function Hero4(){
  const [q, setQ] = React.useState('');
  const [setting, setSetting] = React.useState('all');
  const [pay, setPay] = React.useState(75);
  const [chip, setChip] = React.useState('all');

  const filtered = React.useMemo(() => {
    return ALL_JOBS.filter(j => {
      if (q && !(j.role + ' ' + j.loc).toLowerCase().includes(q.toLowerCase())) return false;
      if (setting !== 'all' && j.setting !== setting) return false;
      if (j.payN < pay) return false;
      if (chip !== 'all' && j.type !== chip) return false;
      return true;
    });
  }, [q, setting, pay, chip]);

  return (
    <section className="hero h4">
      <div className="topline">
        <div style={{fontFamily:'Fraunces,serif',fontSize:18,fontWeight:500}}>1099.health</div>
        <div className="nav">
          <a href="#">Jobs</a>
          <a href="#" className="active">PMHNP</a>
          <a href="#">Resources</a>
          <a href="#">Tax tools</a>
          <a href="#">Sign in</a>
        </div>
        <span className="pill"><span className="dot"/>{filtered.length} live now</span>
      </div>
      <div className="grid">
        <div className="col-l">
          <div className="eyebrow">395+ open positions</div>
          <h1>1099 PMHNP <em>Jobs.</em></h1>
          <p className="deck">Find independent contractor PMHNP work paying $75–$150+/hr — with Schedule&nbsp;C deductions, flexible caseloads, and no non-competes.</p>

          <div className="searchbar">
            <div className="field">
              <label>Role or keyword</label>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="e.g. child, telehealth, addiction"/>
            </div>
            <div className="field">
              <label>Setting</label>
              <select value={setting} onChange={e=>setSetting(e.target.value)}>
                <option value="all">All settings</option>
                <option value="private">Private practice</option>
                <option value="group">Group practice</option>
                <option value="agency">Staffing agency</option>
              </select>
            </div>
            <div className="field">
              <label>Min pay · ${pay}/hr</label>
              <input type="range" min={75} max={150} step={5} value={pay} onChange={e=>setPay(+e.target.value)}/>
            </div>
            <button className="btn btn-primary">Search <span className="arr"></span></button>
          </div>

          <div className="chips">
            {['all','telehealth','in-person','hybrid'].map(c => (
              <span key={c} className={'chip' + (chip===c?' on':'')} onClick={()=>setChip(c)}>
                {c==='all' ? 'All formats' : c[0].toUpperCase()+c.slice(1)}
              </span>
            ))}
          </div>
        </div>

        <div className="col-r">
          <div className="frame">
            <img src={ILLO} alt=""/>
            <div className="float float-a">
              <div className="ttl">Median pay</div>
              <div className="row"><span className="big">$112/hr</span><span className="delta">▲ 9%</span></div>
            </div>
            <div className="float float-b">
              <div className="ttl">Tax savings</div>
              <div className="row"><span className="big">~$24k</span></div>
              <div style={{font:'400 11px/1.4 Inter,sans-serif',color:'var(--ink-soft)',marginTop:6}}>Avg Schedule&nbsp;C deductions</div>
            </div>
          </div>
        </div>
      </div>

      <div className="results-strip">
        <div className="count">{filtered.length}<small>matching now</small></div>
        <div className="preview-cards">
          {filtered.slice(0,4).map((j,i) => (
            <div className="pcard" key={i}>
              <div className="role">{j.role}</div>
              <div className="meta"><span>{j.loc}</span><span className="pay">{j.pay}</span></div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="pcard" style={{minWidth:300,color:'var(--ink-soft)'}}>No jobs match — loosen pay or setting.</div>
          )}
        </div>
        <a className="btn btn-primary" href="#">View all <span className="arr"></span></a>
      </div>
    </section>
  );
}

// ─── 05 · Oversized type / asymmetric collage ────────────────────────────────
function Hero5(){
  return (
    <section className="hero h5">
      <div className="swatch"/>
      <div className="inner">
        <div className="row1">
          <span className="badge"><span className="dot"/>395 live roles · updated 4 min ago</span>
          <span className="crumbs"><span>Careers</span><span>Nurse Practitioner</span><span className="now">1099 PMHNP</span></span>
          <span style={{fontFamily:'DM Mono, monospace',letterSpacing:'.1em'}}>№ 04 / 26</span>
        </div>
        <div className="stage">
          <h1>
            1099<br/>
            PMHNP
            <span className="small"><em>jobs,</em> on your terms.</span>
          </h1>
          <div className="photo">
            <img src={ILLO} alt=""/>
            <div className="tag"><b>This week</b>+38 new postings across telehealth, group, and private practice.</div>
          </div>
        </div>
        <div className="footer">
          <div className="stats">
            <div>$75–150<small>per hour</small></div>
            <div>0<small>non-competes</small></div>
            <div>247<small>telehealth</small></div>
            <div>~32%<small>tax savings</small></div>
          </div>
          <p className="deck" style={{justifySelf:'end'}}>Independent contractor PMHNP roles with Schedule&nbsp;C deductions, flexible caseloads, and no non-compete clauses.</p>
          <div className="ctas">
            <a className="btn btn-primary" href="#">Browse jobs <span className="arr"></span></a>
            <a className="btn btn-ghost" href="#">Set alert <span className="arr"></span></a>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Hero1, Hero2, Hero3, Hero4, Hero5 });
