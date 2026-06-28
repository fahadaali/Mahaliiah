/* ===== المحلية | mahalliah — Dashboard Logic ===== */
(function(){
"use strict";
const D = window.DASH_DATA;
const TODAY = new Date(D.generated + "T00:00:00");

/* ---- helpers ---- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};

const ST = {
  valid:    {ar:"ساري",        cls:"b-ok",      color:"var(--ok)"},
  soon:     {ar:"قريب الانتهاء", cls:"b-warn",    color:"var(--warn)"},
  expired:  {ar:"منتهي",        cls:"b-danger",  color:"var(--danger)"},
  recurring:{ar:"متكرر شهرياً",  cls:"b-neutral", color:"var(--neutral)"},
  unknown:  {ar:"غير محدد",     cls:"b-neutral", color:"var(--neutral)"}
};
const fmtDate = iso => iso ? iso.split("-").reverse().join("/") : "—";
const daysTxt = d => d==null ? "—" : (d<0 ? `منذ ${Math.abs(d)} يوم` : `${d} يوم`);
function badge(s){const m=ST[s]||ST.unknown;return `<span class="badge ${m.cls}">${m.ar}</span>`;}

/* ---- filter state ---- */
const state = {company:"", status:"", window:"", q:""};

function companies(){
  const set=new Set();
  ["licenses","iqamas","vehicles"].forEach(g=>D[g].forEach(r=>{if(r.company_norm)set.add(r.company_norm);}));
  return Array.from(set).sort();
}

/* a record passes the global filters */
function passCompany(r){return !state.company || r.company_norm===state.company;}
function passStatus(s){return !state.status || s===state.status;}
function passWindow(days){
  if(!state.window) return true;
  if(days==null) return false;
  const w=+state.window;
  return days>=0 && days<=w;
}
function passQ(text){return !state.q || (text||"").toLowerCase().includes(state.q.toLowerCase());}

/* ---- filtered datasets (status uses the relevant field) ---- */
function fLicenses(){
  return D.licenses.filter(r=>passCompany(r)&&passStatus(r.status)&&passWindow(r.days)
    &&passQ(r.item+" "+r.platform+" "+r.company_norm));
}
function fIqamas(){
  return D.iqamas.filter(r=>passCompany(r)&&passStatus(r.status)&&passWindow(r.days)
    &&passQ(r.name+" "+r.number+" "+r.company_norm));
}
function fVehicles(){
  // vehicle status keyed on form_status (الاستمارة)
  return D.vehicles.filter(r=>passCompany(r)&&passStatus(r.form_status)&&passWindow(r.form_days)
    &&passQ(r.type+" "+r.plate+" "+r.company_norm));
}

/* ===================== RENDER ===================== */
function render(){
  const L=fLicenses(), I=fIqamas(), V=fVehicles();
  renderKPIs(L,I,V);
  renderDonut(I);
  renderCompanyBars(L,I,V);
  renderVehicleStatus(V);
  renderTimeline(I);
  renderExpiringSoon(L,I,V);
  renderTables(L,I,V);
}

/* ---- KPIs ---- */
function renderKPIs(L,I,V){
  const cont=$("#kpis");cont.innerHTML="";
  const expSoon = L.filter(x=>x.status==="soon").length
                + I.filter(x=>x.status==="soon").length
                + V.filter(x=>x.form_status==="soon").length;
  const expired = L.filter(x=>x.status==="expired").length
                + I.filter(x=>x.status==="expired").length
                + V.filter(x=>x.form_status==="expired").length;
  const cards=[
    {label:"التراخيص والسجلات", value:L.length, sub:"سجل قيد المتابعة", cls:"dark"},
    {label:"إقامات الموظفين", value:I.length, sub:"موظف مسجّل", cls:""},
    {label:"المركبات", value:V.length, sub:"مركبة في الأسطول", cls:""},
    {label:"المنصات والأنظمة", value:D.platforms.length, sub:"جهة / نظام", cls:"dark"},
    {label:"قريبة الانتهاء (≤90 يوم)", value:expSoon, sub:"تحتاج متابعة عاجلة", cls:"warn"},
    {label:"منتهية", value:expired, sub:"تتطلب تجديد فوري", cls:"danger"},
  ];
  cards.forEach(c=>{
    cont.appendChild(el("div","kpi "+c.cls,
      `<div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div>`));
  });
}

/* ---- Donut: iqama status ---- */
function renderDonut(I){
  const counts={valid:0,soon:0,expired:0};
  I.forEach(r=>{counts[r.status]=(counts[r.status]||0)+1;});
  const total=I.length||1;
  const segs=[["valid",counts.valid],["soon",counts.soon],["expired",counts.expired]].filter(s=>s[1]>0);
  let acc=0, grad=[];
  segs.forEach(([k,v])=>{const a=acc, b=acc+v/total*100;grad.push(`${ST[k].color} ${a}% ${b}%`);acc=b;});
  if(!grad.length) grad.push("var(--neutral-bg) 0% 100%");
  const donut=$("#donut");
  donut.style.background=`conic-gradient(${grad.join(",")})`;
  $("#donut-total").textContent=I.length;
  const lg=$("#donut-legend");lg.innerHTML="";
  [["valid","ساري"],["soon","قريب الانتهاء"],["expired","منتهي"]].forEach(([k,t])=>{
    lg.appendChild(el("div","li",
      `<span class="sw" style="background:${ST[k].color}"></span>${t} <b style="margin-right:auto;color:var(--brand-dark)">${counts[k]||0}</b>`));
  });
}

/* ---- Horizontal bars: records per company ---- */
function renderCompanyBars(L,I,V){
  const map={};
  const add=(c,n)=>{if(!c)return;map[c]=map[c]||{lic:0,iq:0,veh:0};map[c][n]++;};
  L.forEach(r=>add(r.company_norm,"lic"));
  I.forEach(r=>add(r.company_norm,"iq"));
  V.forEach(r=>add(r.company_norm,"veh"));
  const rows=Object.entries(map).map(([c,o])=>[c,o.lic+o.iq+o.veh,o]);
  rows.sort((a,b)=>b[1]-a[1]);
  const max=Math.max(1,...rows.map(r=>r[1]));
  const box=$("#company-bars");box.innerHTML="";
  if(!rows.length){box.innerHTML='<div class="empty">لا توجد بيانات مطابقة</div>';return;}
  rows.forEach(([c,tot,o])=>{
    const r=el("div","bar-row");
    r.innerHTML=`<div class="name" title="${c}">${c}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${tot/max*100}%"></div></div>
      <div class="num">${tot}</div>`;
    r.title=`تراخيص: ${o.lic} • إقامات: ${o.iq} • مركبات: ${o.veh}`;
    box.appendChild(r);
  });
}

/* ---- Vehicle inspection vs form status ---- */
function renderVehicleStatus(V){
  const box=$("#vehicle-bars");box.innerHTML="";
  const cats=[["الاستمارة","form_status"],["الفحص الدوري","insp_status"]];
  const keys=["valid","soon","expired","unknown"];
  cats.forEach(([label,fld])=>{
    const c={};keys.forEach(k=>c[k]=0);
    V.forEach(r=>{c[r[fld]]=(c[r[fld]]||0)+1;});
    const total=V.length||1;
    const r=el("div","bar-row");
    let segHtml=`<div class="bar-track" style="display:flex">`;
    keys.forEach(k=>{if(c[k]>0)segHtml+=`<div title="${ST[k].ar}: ${c[k]}" style="height:100%;width:${c[k]/total*100}%;background:${ST[k].color}"></div>`;});
    segHtml+=`</div>`;
    r.innerHTML=`<div class="name">${label}</div>${segHtml}<div class="num">${V.length}</div>`;
    box.appendChild(r);
  });
}

/* ---- Timeline: iqama expiries per month (next 12 months) ---- */
function renderTimeline(I){
  const box=$("#timeline");box.innerHTML="";
  const months=[];
  for(let i=0;i<12;i++){
    const d=new Date(TODAY.getFullYear(),TODAY.getMonth()+i,1);
    months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,
      lbl:d.toLocaleDateString("ar-EG",{month:"short"}),valid:0,soon:0,expired:0});
  }
  I.forEach(r=>{
    if(!r.expiry)return;
    const k=r.expiry.slice(0,7);
    const m=months.find(x=>x.key===k);
    if(m)m[r.status]=(m[r.status]||0)+1;
  });
  const max=Math.max(1,...months.map(m=>m.valid+m.soon+m.expired));
  months.forEach(m=>{
    const tot=m.valid+m.soon+m.expired;
    const col=el("div","col");
    let stack=`<div class="tot">${tot||""}</div><div class="stack" style="height:${tot/max*100}%">`;
    ["expired","soon","valid"].forEach(k=>{
      if(m[k]>0)stack+=`<div class="seg" title="${ST[k].ar}: ${m[k]}" style="flex:${m[k]};background:${ST[k].color}"></div>`;
    });
    stack+=`</div><div class="lbl">${m.lbl}</div>`;
    col.innerHTML=stack;
    box.appendChild(col);
  });
}

/* ---- Expiring soon list (next 90 days, sorted) ---- */
function renderExpiringSoon(L,I,V){
  const items=[];
  L.forEach(r=>{if(r.days!=null&&r.days>=0&&r.days<=90)items.push({t:"ترخيص",name:r.item,c:r.company_norm,days:r.days,date:r.expiry,s:r.status});});
  I.forEach(r=>{if(r.days!=null&&r.days>=0&&r.days<=90)items.push({t:"إقامة",name:r.name,c:r.company_norm,days:r.days,date:r.expiry,s:r.status});});
  V.forEach(r=>{if(r.form_days!=null&&r.form_days>=0&&r.form_days<=90)items.push({t:"استمارة",name:r.type+" — "+r.plate,c:r.company_norm,days:r.form_days,date:r.form_expiry,s:r.form_status});});
  items.sort((a,b)=>a.days-b.days);
  const box=$("#soon-list");box.innerHTML="";
  $("#soon-count").textContent=items.length;
  if(!items.length){box.innerHTML='<div class="empty">لا عناصر قريبة الانتهاء ضمن 90 يوماً 🎉</div>';return;}
  const tbl=el("table");
  tbl.innerHTML=`<thead><tr><th>النوع</th><th>البيان</th><th>الشركة</th><th>تاريخ الانتهاء</th><th>المتبقي</th></tr></thead>`;
  const tb=el("tbody");
  items.slice(0,40).forEach(it=>{
    tb.appendChild(el("tr",null,
      `<td><span class="badge b-neutral">${it.t}</span></td><td>${it.name}</td><td>${it.c}</td>
       <td>${fmtDate(it.date)}</td><td><span class="badge ${ST[it.s].cls}">${daysTxt(it.days)}</span></td>`));
  });
  tbl.appendChild(tb);box.appendChild(tbl);
}

/* ===================== TABLES ===================== */
let activeTab="licenses";
const sortState={licenses:{k:null,dir:1},iqamas:{k:null,dir:1},vehicles:{k:null,dir:1},platforms:{k:null,dir:1}};

const TCFG={
  licenses:{
    cols:[["item","البيان"],["company_norm","الشركة"],["platform","المنصة"],["hijri","انتهاء (هجري)"],["expiry","انتهاء (ميلادي)"],["days","المتبقي"],["status","الحالة"]],
    data:fLicenses,
    cell:(r,k)=>{
      if(k==="expiry")return r.expiry?fmtDate(r.expiry):(r.expiry_text||"—");
      if(k==="days")return r.status==="recurring"?'<span class="badge b-neutral">شهري</span>':daysBadge(r.days,r.status);
      if(k==="status")return badge(r.status);
      if(k==="hijri")return r.hijri||"—";
      return r[k]||"—";
    }
  },
  iqamas:{
    cols:[["name","اسم الموظف"],["company_norm","الشركة"],["number","رقم الإقامة"],["expiry","تاريخ الانتهاء"],["days","المتبقي"],["status","الحالة"]],
    data:fIqamas,
    cell:(r,k)=>{
      if(k==="expiry")return fmtDate(r.expiry);
      if(k==="days")return daysBadge(r.days,r.status);
      if(k==="status")return badge(r.status);
      return r[k]||"—";
    }
  },
  vehicles:{
    cols:[["type","نوع المركبة"],["plate","رقم اللوحة"],["form_expiry","انتهاء الاستمارة"],["form_status","حالة الاستمارة"],["insp_expiry","انتهاء الفحص"],["insp_status","حالة الفحص"],["condition","الحالة"]],
    data:fVehicles,
    cell:(r,k)=>{
      if(k==="form_expiry")return fmtDate(r.form_expiry);
      if(k==="insp_expiry")return r.insp_expiry?fmtDate(r.insp_expiry):(r.insp_hijri||"—");
      if(k==="form_status")return daysBadge(r.form_days,r.form_status);
      if(k==="insp_status")return badge(r.insp_status);
      return r[k]||"—";
    }
  },
  platforms:{
    cols:[["i","#"],["name","اسم الجهة / النظام"]],
    data:()=>D.platforms.filter(p=>passQ(p)).map((name,i)=>({i:i+1,name})),
    cell:(r,k)=>r[k]
  }
};
function daysBadge(d,s){return d==null?"—":`<span class="badge ${ST[s].cls}">${daysTxt(d)}</span>`;}

function renderTables(){
  const cfg=TCFG[activeTab];
  let rows=cfg.data();
  const ss=sortState[activeTab];
  if(ss.k){
    rows=rows.slice().sort((a,b)=>{
      let x=a[ss.k],y=b[ss.k];
      if(x==null)x="";if(y==null)y="";
      if(typeof x==="number"||typeof y==="number")return (Number(x)-Number(y))*ss.dir;
      return String(x).localeCompare(String(y),"ar")*ss.dir;
    });
  }
  $("#table-count").textContent=rows.length+" سجل";
  const wrap=$("#table-wrap");wrap.innerHTML="";
  if(!rows.length){wrap.innerHTML='<div class="empty">لا توجد سجلات مطابقة للفلاتر المختارة</div>';return;}
  const tbl=el("table");
  const thead=el("thead");const tr=el("tr");
  cfg.cols.forEach(([k,t])=>{
    const arr= ss.k===k ? (ss.dir===1?"▲":"▼") : "⇅";
    const th=el("th",null,`${t} <span class="arr">${arr}</span>`);
    th.onclick=()=>{if(ss.k===k)ss.dir*=-1;else{ss.k=k;ss.dir=1;}renderTables();};
    tr.appendChild(th);
  });
  thead.appendChild(tr);tbl.appendChild(thead);
  const tb=el("tbody");
  rows.forEach(r=>{
    const trr=el("tr");
    cfg.cols.forEach(([k])=>trr.appendChild(el("td",null,cfg.cell(r,k))));
    tb.appendChild(trr);
  });
  tbl.appendChild(tb);wrap.appendChild(tbl);
}

/* ===================== INIT ===================== */
function init(){
  // company filter options
  const sel=$("#f-company");
  companies().forEach(c=>{const o=el("option");o.value=c;o.textContent=c;sel.appendChild(o);});
  // bind filters
  sel.onchange=e=>{state.company=e.target.value;render();};
  $("#f-status").onchange=e=>{state.status=e.target.value;render();};
  $("#f-window").onchange=e=>{state.window=e.target.value;render();};
  $("#f-search").oninput=e=>{state.q=e.target.value;render();};
  $("#f-reset").onclick=()=>{
    state.company="";state.status="";state.window="";state.q="";
    sel.value="";$("#f-status").value="";$("#f-window").value="";$("#f-search").value="";
    render();
  };
  // tabs
  $$(".tab").forEach(t=>t.onclick=()=>{
    $$(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");activeTab=t.dataset.tab;renderTables();
  });
  $("#gen-date").textContent=fmtDate(D.generated);
  render();
}
if(document.readyState!=="loading")init();else document.addEventListener("DOMContentLoaded",init);
})();
