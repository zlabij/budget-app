import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid } from "recharts";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const EMOJIS = [
  "🍔","🍕","🍜","🛒","🥗","☕","🍷","🍣","🥡","🍱",
  "🚗","⛽","🚌","✈️","🛵","🚕","🚢","🛞","🅿️","🚦",
  "🏠","🏡","🛋️","💡","🔑","🛏️","🪴","🧹","🚿","🪟",
  "🎮","🎬","🎵","🎭","🎨","📚","🎲","🎯","🎪","🎟️",
  "💊","🏥","🧘","🏋️","🩺","💉","🦷","👟","🩹","🧬",
  "🛍️","👗","👠","💄","🧴","💍","🎁","🪞","👒","🧣",
  "⚡","📱","💻","📡","🖨️","🔌","📺","🎧","🖥️","⌨️",
  "📦","💼","✏️","🏦","💰","🐾","🌍","🎓","🔧","📋",
];
const PALETTE = ["#f97316","#3b82f6","#8b5cf6","#ec4899","#10b981","#f59e0b","#06b6d4","#6b7280","#ef4444","#84cc16","#a855f7","#14b8a6","#f43f5e","#0ea5e9"];

function getKey(y,m){return `budgetv3_${y}_${m}`;}
function load(y,m){try{const r=localStorage.getItem(getKey(y,m));return r?JSON.parse(r):null;}catch{return null;}}
function save(y,m,d){try{localStorage.setItem(getKey(y,m),JSON.stringify(d));}catch{}}
function loadX(k){try{const r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch{return null;}}
function saveX(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function getPrev(y,m){return m===0?{year:y-1,month:11}:{year:y,month:m-1};}
function mkCat(name,emoji,color,budget){return{name,emoji:emoji||"📦",color:color||"#7c3aed",budget:+budget||0,spent:0,transactions:[],carryover:0};}
const fmt=n=>(+n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
function daysUntilDue(dueDay){
  if(!dueDay)return null;
  const t=new Date(),d=new Date(t.getFullYear(),t.getMonth(),dueDay);
  if(d<t)d.setMonth(d.getMonth()+1);
  return Math.ceil((d-t)/(864e5));
}

function getMotivations(income,categories,savings,fixedExpenses,balanceCarryover){
  const msgs=[];
  const tf=fixedExpenses.reduce((s,f)=>s+(f.actualAmount??f.amount),0);
  const ts=savings.reduce((s,sv)=>s+sv.deposited,0);
  categories.forEach(cat=>{
    const total=cat.budget+cat.carryover;if(total<=0)return;
    const pct=cat.spent/total;
    if(pct>=0.9&&pct<1)msgs.push({type:"warn",icon:"⚠️",text:`Almost out of ${cat.emoji} ${cat.name} budget — only $${fmt(total-cat.spent)} left!`});
    else if(pct>=1)msgs.push({type:"over",icon:"🚨",text:`Over your ${cat.emoji} ${cat.name} budget by $${fmt(cat.spent-total)}.`});
    else if(pct<0.3&&cat.spent>0)msgs.push({type:"good",icon:"🎉",text:`Only used ${(pct*100).toFixed(0)}% of ${cat.emoji} ${cat.name}. Great pacing!`});
  });
  savings.forEach(sv=>{
    const all=(sv.totalDeposited||0)+sv.deposited;
    if(sv.goal<=0)return;
    const pct=all/sv.goal;
    if(pct>=1)msgs.push({type:"great",icon:"🏆",text:`You hit your ${sv.emoji||"🏦"} ${sv.name} goal!`});
    else if(pct>=0.75)msgs.push({type:"good",icon:"💪",text:`${sv.emoji||"🏦"} ${sv.name} is ${(pct*100).toFixed(0)}% funded — almost there!`});
    else if(sv.deposited===0)msgs.push({type:"nudge",icon:"💡",text:`Don't forget your ${sv.emoji||"🏦"} ${sv.name} goal — even $10 helps!`});
  });
  fixedExpenses.forEach(fx=>{
    const days=daysUntilDue(fx.dueDay);
    if(days!==null&&days<=3)msgs.push({type:"warn",icon:"📅",text:`${fx.emoji} ${fx.name} ($${fmt(fx.actualAmount??fx.amount)}) is due in ${days===0?"today":days===1?"1 day":`${days} days`}!`});
  });
  const bal=income+balanceCarryover-tf-categories.reduce((s,c)=>s+c.spent,0)-ts;
  if(income>0&&bal<0)msgs.push({type:"over",icon:"🚨",text:`Balance is negative. You're $${fmt(Math.abs(bal))} over your income.`});
  if(msgs.length===0&&income>0)msgs.push({type:"great",icon:"✨",text:`You're on track this month. Keep it up!`});
  return msgs;
}

export default function App(){
  const now=new Date();
  const [yr,setYr]=useState(now.getFullYear());
  const [mo,setMo]=useState(now.getMonth());
  const [income,setIncome]=useState(0);
  const [balCarry,setBalCarry]=useState(0);
  const [categories,setCategories]=useState([]);
  const [savings,setSavings]=useState([]);
  const [fixed,setFixed]=useState([]);
  const [accounts,setAccounts]=useState([]);
  const [templates,setTemplates]=useState([]);
  const [ious,setIous]=useState([]);
  const [lastCat,setLastCat]=useState(null);
  const [view,setView]=useState("overview");
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [nudgeIdx,setNudgeIdx]=useState(0);

  // form state
  const [incomeInput,setIncomeInput]=useState("");
  const [catName,setCatName]=useState(""); const [catEmoji,setCatEmoji]=useState("📦"); const [catColor,setCatColor]=useState("#7c3aed"); const [catBudget,setCatBudget]=useState(""); const [showCatEmoji,setShowCatEmoji]=useState(false);
  const [spendAmt,setSpendAmt]=useState(""); const [spendNote,setSpendNote]=useState("");
  const [savName,setSavName]=useState(""); const [savGoal,setSavGoal]=useState(""); const [savEmoji,setSavEmoji]=useState("🏦"); const [showSavEmoji,setShowSavEmoji]=useState(false);
  const [depAmt,setDepAmt]=useState("");
  const [fixName,setFixName]=useState(""); const [fixEmoji,setFixEmoji]=useState("🏠"); const [fixAmt,setFixAmt]=useState(""); const [fixDue,setFixDue]=useState(""); const [showFixEmoji,setShowFixEmoji]=useState(false);
  const [editFixIdx,setEditFixIdx]=useState(null); const [editFixAmt,setEditFixAmt]=useState(""); const [editFixDue,setEditFixDue]=useState("");
  const [logActualIdx,setLogActualIdx]=useState(null); const [logActualAmt,setLogActualAmt]=useState("");
  const [accName,setAccName]=useState(""); const [accEmoji,setAccEmoji]=useState("🏦"); const [accBal,setAccBal]=useState(""); const [showAccEmoji,setShowAccEmoji]=useState(false); const [editAccIdx,setEditAccIdx]=useState(null); const [editAccBal,setEditAccBal]=useState("");
  const [tmplName,setTmplName]=useState("");
  const [editBudgetVal,setEditBudgetVal]=useState("");
  const [qaCat,setQaCat]=useState(null); const [qaAmt,setQaAmt]=useState(""); const [qaNote,setQaNote]=useState("");
  const [iouName,setIouName]=useState(""); const [iouAmt,setIouAmt]=useState(""); const [iouNote,setIouNote]=useState(""); const [iouCat,setIouCat]=useState("");

  useEffect(()=>{
    let d=load(yr,mo);
    if(!d){
      const p=getPrev(yr,mo); const pd=load(p.year,p.month);
      let cats=[],prevInc=0,prevSavs=[],prevFixed=[],prevBalCarry=0;
      if(pd){
        cats=(pd.categories||[]).map(c=>{const lo=(c.budget+c.carryover)-c.spent;return{...mkCat(c.name,c.emoji,c.color,c.budget),carryover:lo>0?+lo.toFixed(2):0};});
        prevInc=pd.income||0;
        prevSavs=(pd.savings||[]).map(s=>({...s,totalDeposited:+(((s.totalDeposited||0)+s.deposited).toFixed(2)),deposited:0,transactions:[]}));
        prevFixed=(pd.fixedExpenses||[]).map(f=>({...f,actualAmount:undefined}));
        const pTF=prevFixed.reduce((s,f)=>s+f.amount,0);
        const pTB=(pd.categories||[]).reduce((s,c)=>s+c.budget+c.carryover,0);
        const pTS=(pd.savings||[]).reduce((s,sv)=>s+sv.deposited,0);
        const pFree=prevInc-pTF-pTB-pTS;
        prevBalCarry=+(Math.max(pFree,0)+(pd.balanceCarryover||0)).toFixed(2);
      }
      d={categories:cats,income:prevInc,savings:prevSavs,fixedExpenses:prevFixed,balanceCarryover:prevBalCarry};
      save(yr,mo,d);
    }
    const globalFixed=loadX("global_fixed")||[];
    const monthFixed=(d.fixedExpenses&&d.fixedExpenses.length>0)?d.fixedExpenses:globalFixed;
    setCategories(d.categories||[]); setIncome(d.income||0); setSavings(d.savings||[]); setFixed(monthFixed); setBalCarry(d.balanceCarryover||0);
    setIncomeInput((d.income||0).toString());
  },[yr,mo]);

  useEffect(()=>{setAccounts(loadX("nw_accounts")||[]);setTemplates(loadX("budget_templates")||[]);setIous(loadX("ious")||[]);setLastCat(loadX("last_cat")||null);},[]);

  function persist(cats,inc,savs,fx){
    const c=cats??categories,i=inc??income,s=savs??savings,f=fx??fixed;
    setCategories(c);setIncome(i);setSavings(s);setFixed(f);
    save(yr,mo,{categories:c,income:i,savings:s,fixedExpenses:f,balanceCarryover:balCarry});
    if(fx!==null)saveX("global_fixed",f);
  }
  function persistAccounts(a){setAccounts(a);saveX("nw_accounts",a);}
  function persistTemplates(t){setTemplates(t);saveX("budget_templates",t);}
  function persistIous(list){setIous(list);saveX("ious",list);}
  function showToast(msg,type="ok"){setToast({msg,type});setTimeout(()=>setToast(null),2600);}

  function logSpend(catName,amt,note){
    const updated=categories.map(c=>c.name!==catName?c:{...c,spent:+(c.spent+amt).toFixed(2),transactions:[{amount:amt,note:note||null,date:new Date().toLocaleDateString(),dow:new Date().getDay()},...c.transactions]});
    persist(updated,null,null,null);
    setLastCat(catName);saveX("last_cat",catName);
    showToast(`$${fmt(amt)} logged ✓`);
  }

  // Derived values
  const pendingIous=ious.filter(x=>!x.paid);
  const totalOwed=pendingIous.reduce((s,x)=>s+x.amount,0);
  const totalFixed=fixed.reduce((s,f)=>s+(f.actualAmount??f.amount),0);
  const totalSpent=categories.reduce((s,c)=>s+c.spent,0);
  const totalBudgeted=categories.reduce((s,c)=>s+c.budget+c.carryover,0);
  const totalSaved=savings.reduce((s,sv)=>s+sv.deposited,0);
  // Balance: income minus fixed minus what you actually spent minus what you saved
  // Pending IOUs are shown separately — they're money you spent but expect back
  const balance=income+balCarry-totalFixed-totalSpent-totalSaved;
  const unallocated=income+balCarry-totalFixed-totalBudgeted-totalSaved;
  const netWorth=accounts.reduce((s,a)=>s+a.balance,0)+savings.reduce((s,sv)=>s+(sv.totalDeposited||0)+sv.deposited,0);

  const motivations=getMotivations(income,categories,savings,fixed,balCarry);
  useEffect(()=>{if(motivations.length<=1)return;const t=setInterval(()=>setNudgeIdx(i=>(i+1)%motivations.length),5000);return()=>clearInterval(t);},[motivations.length]);
  const nudge=motivations[nudgeIdx%motivations.length];

  const trendData=useMemo(()=>{
    const pts=[];
    for(let i=5;i>=0;i--){
      let ty=yr,tm=mo-i;while(tm<0){tm+=12;ty--;}
      const d=load(ty,tm);
      const entry={month:SHORT[tm],total:0};
      if(d)(d.categories||[]).forEach(c=>{entry[c.name]=(entry[c.name]||0)+c.spent;entry.total+=c.spent;});
      pts.push(entry);
    }
    return pts;
  },[yr,mo,categories]);

  const dowData=useMemo(()=>{
    const totals=new Array(7).fill(0);
    categories.forEach(cat=>cat.transactions.forEach(tx=>{
      const d=new Date(tx.date);if(!isNaN(d))totals[d.getDay()]+=tx.amount;
    }));
    return DAYS.map((day,i)=>({day,amount:+totals[i].toFixed(2)}));
  },[categories]);

  const topDay=dowData.reduce((a,b)=>b.amount>a.amount?b:a,{day:"",amount:0});

  function exportCSV(){
    const rows=[["Month","Category","Amount","Note","Date"]];
    for(let i=0;i<12;i++){
      let ty=yr,tm=mo-i;while(tm<0){tm+=12;ty--;}
      const d=load(ty,tm);if(!d)continue;
      (d.categories||[]).forEach(cat=>(cat.transactions||[]).forEach(tx=>{
        rows.push([`${SHORT[tm]} ${ty}`,cat.name,tx.amount,tx.note||"",tx.date]);
      }));
    }
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(",")).join("\n");
    const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);a.download=`budget-${SHORT[mo]}-${yr}.csv`;a.click();
    showToast("CSV exported ✓");
  }

  const nudgeColors={warn:"#f59e0b",over:"#ef4444",good:"#10b981",great:"#a78bfa",nudge:"#60a5fa"};
  const tabs=[{id:"overview",icon:"◈",label:"Overview"},{id:"budgets",icon:"◉",label:"Budgets"},{id:"savings",icon:"◎",label:"Savings"},{id:"fixed",icon:"📌",label:"Fixed"},{id:"owed",icon:"🤝",label:"Owed"},{id:"insights",icon:"📈",label:"Insights"},{id:"manage",icon:"⊞",label:"Manage"}];

  return(
    <div style={{minHeight:"100%",background:"#07090f",color:"#e2e4f0",fontFamily:"'DM Sans',sans-serif",paddingBottom:"calc(80px + env(safe-area-inset-bottom))"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        input,button{font-family:'DM Sans',sans-serif}button{cursor:pointer}
        .prog{transition:width 0.55s cubic-bezier(.4,0,.2,1)}
        .card{transition:border-color 0.15s}.card:hover{border-color:#252840!important}
        .txn:hover{background:#111420!important}.eopt:hover{transform:scale(1.25);background:#1e2140!important}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#252840;border-radius:2px}
        @keyframes slideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .nudge{animation:slideUp 0.35s ease}.sheet{animation:slideUp 0.22s ease}
        .fab{transition:transform 0.15s,box-shadow 0.15s}.fab:active{transform:scale(0.94)}
        select{appearance:none;-webkit-appearance:none}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#0c0e18",borderBottom:"1px solid #141726",paddingTop:"calc(env(safe-area-inset-top) + 16px)",paddingLeft:18,paddingRight:18,paddingBottom:0,position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <button onClick={()=>{let y=yr,m=mo-1;if(m<0){m=11;y--;}setYr(y);setMo(m);}} style={{background:"#141726",border:"none",color:"#9ca3c0",borderRadius:9,width:36,height:36,fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"#3d4268",letterSpacing:3,textTransform:"uppercase"}}>Budget Tracker</div>
            <div style={{fontSize:18,fontWeight:700,letterSpacing:-0.5}}>{MONTHS[mo]} {yr}</div>
          </div>
          <button onClick={()=>{let y=yr,m=mo+1;if(m>11){m=0;y++;}setYr(y);setMo(m);}} style={{background:"#141726",border:"none",color:"#9ca3c0",borderRadius:9,width:36,height:36,fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
        </div>

        {/* Balance hero */}
        <div style={{background:"linear-gradient(135deg,#13103a,#0b1528 50%,#0e1a10)",borderRadius:"14px 14px 0 0",padding:"14px 16px 12px",border:"1px solid #1e2140",borderBottom:"none",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-25,right:-25,width:110,height:110,borderRadius:"50%",background:"#7c3aed0d"}}/>
          <div style={{position:"absolute",bottom:-15,left:25,width:80,height:80,borderRadius:"50%",background:"#10b9810a"}}/>
          <div style={{fontSize:9,color:"#4b5280",letterSpacing:2,textTransform:"uppercase",marginBottom:1}}>Available Balance</div>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:30,fontWeight:700,color:balance>=0?"#a78bfa":"#f87171",letterSpacing:-1,marginBottom:4}}>
            {balance<0?"-":""}${fmt(Math.abs(balance))}
          </div>
          {totalOwed>0&&<div style={{fontSize:11,color:"#34d399",marginBottom:10}}>+ ${fmt(totalOwed)} owed to you pending</div>}
          {!totalOwed&&<div style={{marginBottom:10}}/>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
            {[{label:"Income",val:income,color:"#34d399"},{label:"Fixed",val:totalFixed,color:"#f87171"},{label:"Spent",val:totalSpent,color:"#f97316"},{label:"Saved",val:totalSaved,color:"#60a5fa"}].map(item=>(
              <div key={item.label} style={{background:"#ffffff07",borderRadius:8,padding:"6px 8px"}}>
                <div style={{fontSize:8,color:"#3d4268",letterSpacing:1,marginBottom:2,textTransform:"uppercase"}}>{item.label}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,color:item.color}}>${fmt(item.val)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Nudge */}
        {nudge&&(
          <div key={nudgeIdx} className="nudge" style={{background:`${nudgeColors[nudge.type]}10`,borderLeft:`3px solid ${nudgeColors[nudge.type]}`,borderRight:"1px solid #1e2140",padding:"8px 12px",display:"flex",alignItems:"center",gap:9}}>
            <span style={{fontSize:16}}>{nudge.icon}</span>
            <span style={{fontSize:11,color:"#c8cadc",lineHeight:1.4,flex:1}}>{nudge.text}</span>
            {motivations.length>1&&<span style={{fontSize:9,color:"#3d4268",flexShrink:0}}>{nudgeIdx+1}/{motivations.length}</span>}
          </div>
        )}

        {/* Tabs */}
        <div style={{display:"flex",overflowX:"auto",msOverflowStyle:"none",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setView(t.id)} style={{flex:"0 0 auto",padding:"10px 12px 8px",background:"none",border:"none",color:view===t.id?"#a78bfa":"#3d4268",fontSize:10,fontWeight:600,letterSpacing:0.5,borderBottom:`2px solid ${view===t.id?"#7c3aed":"transparent"}`,transition:"color 0.15s",whiteSpace:"nowrap"}}>
              <span style={{marginRight:4,fontSize:12}}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{padding:14}}>

        {/* ── OVERVIEW ── */}
        {view==="overview"&&(
          <div style={{display:"flex",flexDirection:"column",gap:11}}>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:balCarry>0?10:0}}>
                <div>
                  <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Monthly Income</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:24,fontWeight:700,color:"#34d399"}}>${fmt(income)}</div>
                </div>
                <button onClick={()=>{setIncomeInput(income.toString());setModal({type:"income"});}} style={{background:"#1a1f3a",color:"#a78bfa",border:"1px solid #2a2d55",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600}}>{income===0?"Set Income":"Edit"}</button>
              </div>
              {balCarry>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#10b98110",border:"1px solid #10b98125",borderRadius:9,padding:"8px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:14}}>🔄</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:600,color:"#34d399"}}>Carried Over</div>
                      <div style={{fontSize:10,color:"#4b5280"}}>Free balance from last month</div>
                    </div>
                  </div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:"#34d399"}}>+${fmt(balCarry)}</div>
                </div>
              )}
            </div>

            {/* Stacked spend bar */}
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
                <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase"}}>Where Your Money Goes</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#6b7299"}}>${fmt(income+balCarry-balance)} <span style={{color:"#3d4268"}}>/ ${fmt(income+balCarry)}</span></div>
              </div>
              <div style={{height:12,background:"#141726",borderRadius:6,overflow:"hidden",display:"flex",marginBottom:14}}>
                {income+balCarry>0&&[
                  {val:totalFixed,color:"#ef444488"},{val:totalSpent,color:"#f97316"},{val:totalSaved,color:"#3b82f6"},
                ].map((seg,i)=><div key={i} style={{height:"100%",width:`${Math.min((seg.val/(income+balCarry))*100,100)}%`,background:seg.color,transition:"width 0.6s"}}/>)}
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {[{label:"Fixed",val:totalFixed,color:"#f87171"},{label:"Spent",val:totalSpent,color:"#f97316"},{label:"Saved",val:totalSaved,color:"#60a5fa"},{label:"Free",val:Math.max(unallocated,0),color:"#34d399"}].map(item=>(
                  <div key={item.label} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:item.color}}/>
                    <span style={{fontSize:10,color:"#6b7299"}}>{item.label} <span style={{color:item.color,fontFamily:"'Space Mono',monospace"}}>${fmt(item.val)}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending IOUs on overview */}
            {pendingIous.length>0&&(
              <div className="card" style={{background:"#0c0e18",border:"1px solid #10b98130",borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase"}}>Owed to You</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#34d399"}}>${fmt(totalOwed)}</div>
                </div>
                {pendingIous.slice(0,3).map((iou,i)=>(
                  <div key={iou.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{fontSize:13,color:"#9ca3c0"}}>{iou.name}{iou.note&&<span style={{fontSize:11,color:"#4b5280"}}> · {iou.note}</span>}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#34d399"}}>${fmt(iou.amount)}</div>
                  </div>
                ))}
                {pendingIous.length>3&&<div style={{fontSize:11,color:"#4b5280",marginTop:4}}>+{pendingIous.length-3} more in Owed tab</div>}
              </div>
            )}

            {/* Net worth */}
            {(accounts.length>0||savings.some(s=>(s.totalDeposited||0)+s.deposited>0))&&(
              <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase"}}>Net Worth Snapshot</div>
                  <button onClick={()=>setView("manage")} style={{fontSize:10,color:"#4b5280",background:"none",border:"none",padding:0}}>Manage accounts →</button>
                </div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:22,fontWeight:700,color:netWorth>=0?"#34d399":"#f87171",marginTop:6}}>${fmt(netWorth)}</div>
                {accounts.map(a=>(
                  <div key={a.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                    <div style={{fontSize:12,color:"#6b7299"}}>{a.emoji} {a.name}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:a.balance>=0?"#34d399":"#f87171"}}>${fmt(a.balance)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── BUDGETS ── */}
        {view==="budgets"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {categories.length===0?(
              <div style={{textAlign:"center",padding:"50px 20px",color:"#3d4268"}}><div style={{fontSize:40,marginBottom:10}}>📂</div><div style={{fontSize:14}}>No categories — add one in Manage</div></div>
            ):categories.map(cat=>{
              const total=cat.budget+cat.carryover,pct=total>0?Math.min((cat.spent/total)*100,100):0,left=total-cat.spent,over=left<0;
              return(
                <div key={cat.name} className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:38,height:38,borderRadius:10,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:`1px solid ${cat.color}33`}}>{cat.emoji}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:15}}>{cat.name}</div>
                        {cat.carryover>0&&<div style={{fontSize:10,color:"#34d399"}}>+${fmt(cat.carryover)} carried over</div>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:12}}>${fmt(cat.spent)}<span style={{color:"#3d4268"}}> / ${fmt(total)}</span></div>
                      <div style={{fontSize:11,color:over?"#f87171":"#34d399"}}>{over?`$${fmt(Math.abs(left))} over`:`$${fmt(left)} left`}</div>
                    </div>
                  </div>
                  <div style={{height:6,background:"#141726",borderRadius:3,overflow:"hidden",marginBottom:10}}><div className="prog" style={{height:"100%",width:`${pct}%`,background:over?"#ef4444":cat.color,borderRadius:3}}/></div>
                  <div style={{display:"flex",gap:7}}>
                    <button onClick={()=>{setModal({type:"spend",cat});setSpendAmt("");setSpendNote("");}} style={{flex:1,padding:"8px 0",background:cat.color+"18",color:cat.color,border:`1px solid ${cat.color}33`,borderRadius:8,fontSize:12,fontWeight:600}}>+ Log Spend</button>
                    <button onClick={()=>setModal({type:"history",cat})} style={{padding:"8px 12px",background:"#141726",color:"#6b7299",border:"none",borderRadius:8,fontSize:12}}>History</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SAVINGS ── */}
        {view==="savings"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>New Savings Goal</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>setShowSavEmoji(!showSavEmoji)} style={{width:42,height:42,borderRadius:10,background:"#141726",border:"1px solid #252840",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{savEmoji}</button>
                <input value={savName} onChange={e=>setSavName(e.target.value)} placeholder="Goal name" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              {showSavEmoji&&<div style={{display:"flex",flexWrap:"wrap",gap:4,background:"#0a0c14",borderRadius:10,padding:10,marginBottom:8,border:"1px solid #1e2140"}}>{EMOJIS.map(e=><button key={e} className="eopt" onClick={()=>{setSavEmoji(e);setShowSavEmoji(false);}} style={{width:34,height:34,fontSize:18,background:"none",border:"none",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.1s"}}>{e}</button>)}</div>}
              <div style={{display:"flex",gap:8}}>
                <input value={savGoal} onChange={e=>setSavGoal(e.target.value)} type="number" placeholder="Target ($)" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                <button onClick={()=>{if(!savName.trim())return;persist(null,null,[...savings,{name:savName.trim(),emoji:savEmoji,goal:+savGoal||0,deposited:0,totalDeposited:0,transactions:[]}],null);setSavName("");setSavGoal("");setSavEmoji("🏦");showToast("Goal added ✓");}} style={{padding:"9px 16px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:9,fontWeight:600,fontSize:14}}>Add</button>
              </div>
            </div>
            {savings.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"#3d4268"}}><div style={{fontSize:36,marginBottom:10}}>🏦</div><div>No savings goals yet</div></div>
            :savings.map((sv,svIdx)=>{
              const allTime=(sv.totalDeposited||0)+sv.deposited,pct=sv.goal>0?Math.min((allTime/sv.goal)*100,100):0,remaining=sv.goal>0?Math.max(sv.goal-allTime,0):0,hit=sv.goal>0&&allTime>=sv.goal;
              return(
                <div key={sv.name} className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:38,height:38,borderRadius:10,background:"#1d4ed822",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,border:"1px solid #1d4ed833"}}>{sv.emoji||"🏦"}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:15}}>{sv.name}</div>
                        <div style={{fontSize:10,color:hit?"#34d399":"#4b5280"}}>{sv.goal>0?`${pct.toFixed(0)}% of $${fmt(sv.goal)}`:"No target"}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:hit?"#34d399":"#60a5fa"}}>${fmt(allTime)}</div>
                      {sv.goal>0&&!hit&&<div style={{fontSize:10,color:"#3d4268"}}>${fmt(remaining)} to go</div>}
                      {hit&&<div style={{fontSize:10,color:"#34d399",fontWeight:600}}>🎉 Goal reached!</div>}
                    </div>
                  </div>
                  {sv.goal>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{height:8,background:"#141726",borderRadius:4,overflow:"hidden",marginBottom:4,position:"relative"}}>
                        <div className="prog" style={{position:"absolute",height:"100%",width:`${Math.min(((sv.totalDeposited||0)/sv.goal)*100,100)}%`,background:"linear-gradient(90deg,#3b82f6,#8b5cf6)",borderRadius:4}}/>
                        {sv.deposited>0&&<div className="prog" style={{position:"absolute",left:`${Math.min(((sv.totalDeposited||0)/sv.goal)*100,100)}%`,height:"100%",width:`${Math.min((sv.deposited/sv.goal)*100,100)}%`,background:"linear-gradient(90deg,#60a5fa,#a78bfa)",borderRadius:4}}/>}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#3d4268"}}>
                        <span>All-time: ${fmt(allTime)}</span>
                        {sv.deposited>0&&<span style={{color:"#60a5fa"}}>+${fmt(sv.deposited)} this month</span>}
                      </div>
                    </div>
                  )}
                  <div style={{display:"flex",gap:7}}>
                    <button onClick={()=>{setModal({type:"deposit",sv,svIdx});setDepAmt("");}} style={{flex:1,padding:"8px 0",background:"#1d4ed818",color:"#60a5fa",border:"1px solid #1d4ed833",borderRadius:8,fontSize:12,fontWeight:600}}>+ Deposit</button>
                    <button onClick={()=>setModal({type:"savHistory",sv})} style={{padding:"8px 12px",background:"#141726",color:"#6b7299",border:"none",borderRadius:8,fontSize:12}}>History</button>
                    <button onClick={()=>persist(null,null,savings.filter((_,i)=>i!==svIdx),null)} style={{padding:"8px 12px",background:"#141726",color:"#ef4444",border:"none",borderRadius:8,fontSize:12}}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── FIXED ── */}
        {view==="fixed"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Add Fixed Expense</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>setShowFixEmoji(!showFixEmoji)} style={{width:42,height:42,borderRadius:10,background:"#141726",border:"1px solid #252840",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{fixEmoji}</button>
                <input value={fixName} onChange={e=>setFixName(e.target.value)} placeholder="e.g. Rent, Netflix, Gym..." style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              {showFixEmoji&&<div style={{display:"flex",flexWrap:"wrap",gap:4,background:"#0a0c14",borderRadius:10,padding:10,marginBottom:8,border:"1px solid #1e2140"}}>{EMOJIS.map(e=><button key={e} className="eopt" onClick={()=>{setFixEmoji(e);setShowFixEmoji(false);}} style={{width:34,height:34,fontSize:18,background:"none",border:"none",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.1s"}}>{e}</button>)}</div>}
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input value={fixAmt} onChange={e=>setFixAmt(e.target.value)} type="number" placeholder="Amount ($)" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                <input value={fixDue} onChange={e=>setFixDue(e.target.value)} type="number" min="1" max="31" placeholder="Due day" style={{width:90,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              <button onClick={()=>{if(!fixName.trim()||!fixAmt)return;persist(null,null,null,[...fixed,{name:fixName.trim(),emoji:fixEmoji,amount:+fixAmt,dueDay:fixDue?+fixDue:null}]);setFixName("");setFixAmt("");setFixDue("");setFixEmoji("🏠");showToast("Fixed expense added ✓");}} style={{width:"100%",padding:"9px 0",background:"#ef4444",color:"#fff",border:"none",borderRadius:9,fontWeight:600,fontSize:14}}>Add</button>
            </div>
            {fixed.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:"#3d4268"}}><div style={{fontSize:36,marginBottom:10}}>📌</div><div>No fixed expenses yet</div></div>
            :(
              <>
                {fixed.map((fx,i)=>{
                  const days=daysUntilDue(fx.dueDay);
                  const urgent=days!==null&&days<=3;
                  const actual=fx.actualAmount??fx.amount;
                  const hasActual=fx.actualAmount!==undefined&&fx.actualAmount!==fx.amount;
                  return(
                    <div key={fx.name+i} className="card" style={{background:"#0c0e18",border:`1px solid ${urgent?"#ef444440":"#141726"}`,borderRadius:12,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:36,height:36,borderRadius:9,background:"#ef444418",border:"1px solid #ef444428",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{fx.emoji}</div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                            {fx.name}
                            {urgent&&<span style={{fontSize:9,background:"#ef444420",color:"#f87171",border:"1px solid #ef444440",borderRadius:100,padding:"1px 6px",fontWeight:700}}>DUE {days===0?"TODAY":days===1?"TOMORROW":`IN ${days}d`}</span>}
                          </div>
                          {editFixIdx===i?(
                            <div style={{display:"flex",gap:6,marginTop:4}}>
                              <input autoFocus value={editFixAmt} onChange={e=>setEditFixAmt(e.target.value)} type="number" style={{width:80,background:"#141726",border:"1px solid #252840",borderRadius:7,padding:"4px 8px",color:"#e2e4f0",fontSize:13,outline:"none"}}/>
                              <input value={editFixDue} onChange={e=>setEditFixDue(e.target.value)} type="number" min="1" max="31" placeholder="Due day" style={{width:70,background:"#141726",border:"1px solid #252840",borderRadius:7,padding:"4px 8px",color:"#e2e4f0",fontSize:13,outline:"none"}}/>
                              <button onClick={()=>{const amt=parseFloat(editFixAmt);if(isNaN(amt))return;const u=[...fixed];u[i]={...u[i],amount:+amt.toFixed(2),dueDay:editFixDue?+editFixDue:null,actualAmount:undefined};persist(null,null,null,u);setEditFixIdx(null);showToast("Updated ✓");}} style={{padding:"4px 10px",background:"#10b981",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:600}}>Save</button>
                              <button onClick={()=>setEditFixIdx(null)} style={{padding:"4px 8px",background:"#141726",color:"#6b7299",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                            </div>
                          ):(
                            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                              <div style={{fontSize:12,color:hasActual?"#f97316":"#f87171",fontFamily:"'Space Mono',monospace"}}>-${fmt(actual)}/mo{hasActual&&<span style={{fontSize:10,color:"#4b5280",marginLeft:4}}>(set: ${fmt(fx.amount)})</span>}</div>
                              {fx.dueDay&&<div style={{fontSize:10,color:"#4b5280"}}>Due {fx.dueDay}{["st","nd","rd"][((fx.dueDay+90)%100-10)%10-1]||"th"}</div>}
                            </div>
                          )}
                        </div>
                        {editFixIdx!==i&&(
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={()=>{setEditFixIdx(i);setEditFixAmt(fx.amount.toString());setEditFixDue(fx.dueDay?.toString()||"");}} style={{padding:"5px 8px",background:"#141726",color:"#9ca3c0",border:"none",borderRadius:7,fontSize:11}}>Edit</button>
                            <button onClick={()=>setModal({type:"confirmDelete",idx:i,name:fx.name})} style={{padding:"5px 8px",background:"#141726",color:"#ef4444",border:"none",borderRadius:7,fontSize:11}}>✕</button>
                          </div>
                        )}
                      </div>
                      {editFixIdx!==i&&(
                        logActualIdx===i?(
                          <div style={{display:"flex",gap:6,marginTop:10,alignItems:"center"}}>
                            <span style={{fontSize:12,color:"#6b7299",flexShrink:0}}>Actual $</span>
                            <input autoFocus value={logActualAmt} onChange={e=>setLogActualAmt(e.target.value)} type="number" placeholder={fx.amount.toString()} style={{flex:1,background:"#141726",border:"1px solid #7c3aed55",borderRadius:7,padding:"6px 10px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                            <button onClick={()=>{const amt=parseFloat(logActualAmt);if(isNaN(amt)||amt<=0)return;const u=[...fixed];u[i]={...u[i],actualAmount:+amt.toFixed(2)};persist(null,null,null,u);setLogActualIdx(null);setLogActualAmt("");showToast("Actual logged ✓");}} style={{padding:"6px 12px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:600}}>Save</button>
                            <button onClick={()=>{setLogActualIdx(null);setLogActualAmt("");}} style={{padding:"6px 8px",background:"#141726",color:"#6b7299",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                          </div>
                        ):(
                          <button onClick={()=>{setLogActualIdx(i);setLogActualAmt(fx.actualAmount?.toString()||"");}} style={{marginTop:8,width:"100%",padding:"6px 0",background:"#ef444412",color:"#f87171",border:"1px solid #ef444425",borderRadius:7,fontSize:12,fontWeight:600}}>Log Actual Amount This Month</button>
                        )
                      )}
                    </div>
                  );
                })}
                <div style={{background:"#ef444412",border:"1px solid #ef444430",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12,color:"#f87171",fontWeight:600}}>Total Monthly Fixed</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,color:"#f87171"}}>-${fmt(totalFixed)}</div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── OWED TO ME ── */}
        {view==="owed"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pendingIous.length>0&&(
              <div style={{background:"linear-gradient(135deg,#065f4620,#064e3b10)",border:"1px solid #10b98130",borderRadius:14,padding:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Total Owed to You</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:26,fontWeight:700,color:"#34d399"}}>${fmt(totalOwed)}</div>
                </div>
                <div style={{fontSize:9,color:"#4b5280",textAlign:"right"}}><div style={{fontSize:20,marginBottom:4}}>🤝</div>{pendingIous.length} pending</div>
              </div>
            )}
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>New IOU</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input value={iouName} onChange={e=>setIouName(e.target.value)} placeholder="Who owes you?" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                <input value={iouAmt} onChange={e=>setIouAmt(e.target.value)} type="number" placeholder="Amount" style={{width:100,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              <input value={iouNote} onChange={e=>setIouNote(e.target.value)} placeholder="What for? (e.g. dinner, gas, groceries)" style={{width:"100%",background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,marginBottom:8,outline:"none"}}/>
              {categories.length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:"#4b5280",marginBottom:6}}>Link to budget category (optional)</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    <button onClick={()=>setIouCat("")} style={{padding:"5px 10px",background:iouCat===""?"#252840":"#141726",color:iouCat===""?"#a78bfa":"#6b7299",border:`1px solid ${iouCat===""?"#7c3aed55":"#252840"}`,borderRadius:20,fontSize:12}}>None</button>
                    {categories.map(cat=>(
                      <button key={cat.name} onClick={()=>setIouCat(cat.name)} style={{padding:"5px 10px",background:iouCat===cat.name?cat.color+"33":"#141726",color:iouCat===cat.name?cat.color:"#6b7299",border:`1px solid ${iouCat===cat.name?cat.color+"55":"#252840"}`,borderRadius:20,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                        <span>{cat.emoji}</span>{cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={()=>{
                const amt=parseFloat(iouAmt);
                if(!iouName.trim()||!amt||amt<=0)return;
                persistIous([{id:Date.now(),name:iouName.trim(),amount:+amt.toFixed(2),note:iouNote.trim(),category:iouCat,date:new Date().toLocaleDateString(),paid:false,paidDate:null},...ious]);
                setIouName("");setIouAmt("");setIouNote("");setIouCat("");
                showToast("IOU added ✓");
              }} style={{width:"100%",padding:"10px 0",background:"#059669",color:"#fff",border:"none",borderRadius:9,fontWeight:700,fontSize:14}}>Add IOU</button>
            </div>
            {pendingIous.length>0&&(
              <div>
                <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingLeft:2}}>Pending</div>
                {ious.map((iou,i)=>!iou.paid&&(
                  <div key={iou.id} className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:15,color:"#e2e4f0"}}>{iou.name}</div>
                        {iou.note&&<div style={{fontSize:12,color:"#6b7299",marginTop:2}}>{iou.note}</div>}
                        <div style={{display:"flex",gap:8,marginTop:4,alignItems:"center"}}>
                          <div style={{fontSize:10,color:"#4b5280"}}>📅 {iou.date}</div>
                          {iou.category&&<div style={{fontSize:10,color:"#6b7299",background:"#252840",borderRadius:100,padding:"1px 7px"}}>{iou.category}</div>}
                        </div>
                      </div>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,color:"#34d399",marginLeft:12}}>${fmt(iou.amount)}</div>
                    </div>
                    <button onClick={()=>{persistIous(ious.map((x,j)=>j!==i?x:{...x,paid:true,paidDate:new Date().toLocaleDateString()}));showToast(`${iou.name} paid you back ✓`);}} style={{width:"100%",padding:"8px 0",background:"#10b98118",color:"#34d399",border:"1px solid #10b98130",borderRadius:8,fontWeight:700,fontSize:13}}>✓ Mark as Paid</button>
                  </div>
                ))}
              </div>
            )}
            {ious.some(x=>x.paid)&&(
              <div>
                <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingLeft:2}}>Paid Back</div>
                {ious.map((iou,i)=>iou.paid&&(
                  <div key={iou.id} style={{background:"#0a0c14",border:"1px solid #1e2140",borderRadius:12,padding:"10px 14px",marginBottom:6,opacity:0.7}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:14,color:"#6b7299"}}>{iou.name}</div>
                        {iou.note&&<div style={{fontSize:11,color:"#3d4268"}}>{iou.note}</div>}
                        <div style={{fontSize:10,color:"#3d4268",marginTop:2}}>Paid back {iou.paidDate}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#34d39988"}}>${fmt(iou.amount)}</div>
                        <button onClick={()=>persistIous(ious.filter((_,j)=>j!==i))} style={{padding:"3px 7px",background:"none",color:"#3d4268",border:"none",fontSize:12}}>✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ious.length===0&&(
              <div style={{textAlign:"center",padding:"50px 20px",color:"#3d4268"}}>
                <div style={{fontSize:40,marginBottom:12}}>🤝</div>
                <div style={{fontSize:14,marginBottom:6}}>No IOUs yet</div>
                <div style={{fontSize:12}}>When you cover someone's tab, add it here and track when they pay you back</div>
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS ── */}
        {view==="insights"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>6-Month Spending Trend</div>
              {trendData.every(d=>d.total===0)?<div style={{textAlign:"center",color:"#3d4268",padding:"30px 0",fontSize:13}}>No spending data yet</div>:(
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData} margin={{top:4,right:4,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#141726"/>
                    <XAxis dataKey="month" tick={{fill:"#4b5280",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#4b5280",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                    <Tooltip contentStyle={{background:"#0c0e18",border:"1px solid #252840",borderRadius:8,fontSize:11}} labelStyle={{color:"#9ca3c0"}} formatter={(val,name)=>[`$${fmt(val)}`,name]}/>
                    {categories.map(cat=>(
                      <Line key={cat.name} type="monotone" dataKey={cat.name} stroke={cat.color} strokeWidth={2} dot={{fill:cat.color,r:3}} activeDot={{r:5}}/>
                    ))}
                    <Line type="monotone" dataKey="total" stroke="#ffffff22" strokeWidth={1} strokeDasharray="4 4" dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              )}
              {categories.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
                  {categories.map(cat=>(
                    <div key={cat.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#6b7299"}}>
                      <div style={{width:10,height:3,background:cat.color,borderRadius:2}}/>{cat.emoji} {cat.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase"}}>Spending by Day of Week</div>
                {topDay.amount>0&&<div style={{fontSize:10,color:"#f97316",fontWeight:600}}>{topDay.day} is your biggest day</div>}
              </div>
              {dowData.every(d=>d.amount===0)?<div style={{textAlign:"center",color:"#3d4268",padding:"30px 0",fontSize:13}}>No transactions this month yet</div>:(
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={dowData} margin={{top:4,right:4,left:-20,bottom:0}}>
                    <XAxis dataKey="day" tick={{fill:"#4b5280",fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:"#4b5280",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                    <Tooltip contentStyle={{background:"#0c0e18",border:"1px solid #252840",borderRadius:8,fontSize:11}} labelStyle={{color:"#9ca3c0"}} formatter={val=>[`$${fmt(val)}`,"Spent"]}/>
                    <Bar dataKey="amount" radius={[4,4,0,0]}>
                      {dowData.map((entry,i)=><Cell key={i} fill={entry.day===topDay.day?"#f97316":"#2a2d55"}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:14}}>This Month's Breakdown</div>
              {categories.filter(c=>c.spent>0).length===0?<div style={{textAlign:"center",color:"#3d4268",padding:"20px 0",fontSize:13}}>No spending logged yet</div>
              :categories.filter(c=>c.spent>0).sort((a,b)=>b.spent-a.spent).map(cat=>{
                const sharePct=totalSpent>0?(cat.spent/totalSpent)*100:0;
                return(
                  <div key={cat.name} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#9ca3c0"}}>{cat.emoji} {cat.name}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:10,color:"#4b5280"}}>{sharePct.toFixed(0)}%</span>
                        <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:cat.color,fontWeight:600}}>${fmt(cat.spent)}</span>
                      </div>
                    </div>
                    <div style={{height:4,background:"#141726",borderRadius:2,overflow:"hidden"}}><div className="prog" style={{height:"100%",width:`${sharePct}%`,background:cat.color,borderRadius:2}}/></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MANAGE ── */}
        {view==="manage"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Add Budget Category</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>setShowCatEmoji(!showCatEmoji)} style={{width:44,height:44,borderRadius:10,background:"#141726",border:"1px solid #252840",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{catEmoji}</button>
                <input value={catName} onChange={e=>setCatName(e.target.value)} placeholder="Category name" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              {showCatEmoji&&<div style={{display:"flex",flexWrap:"wrap",gap:4,background:"#0a0c14",borderRadius:10,padding:10,marginBottom:8,border:"1px solid #1e2140"}}>{EMOJIS.map(e=><button key={e} className="eopt" onClick={()=>{setCatEmoji(e);setShowCatEmoji(false);}} style={{width:34,height:34,fontSize:18,background:catEmoji===e?"#1e2140":"none",border:"none",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.1s"}}>{e}</button>)}</div>}
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{PALETTE.map(c=><button key={c} onClick={()=>setCatColor(c)} style={{width:22,height:22,borderRadius:"50%",background:c,border:catColor===c?"3px solid #fff":"3px solid transparent",outline:"none",flexShrink:0}}/>)}</div>
              <div style={{display:"flex",gap:8}}>
                <input value={catBudget} onChange={e=>setCatBudget(e.target.value)} type="number" placeholder="Monthly budget ($)" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                <button onClick={()=>{if(!catName.trim())return;if(categories.find(c=>c.name.toLowerCase()===catName.trim().toLowerCase())){showToast("Already exists","err");return;}persist([...categories,mkCat(catName.trim(),catEmoji,catColor,catBudget)],null,null,null);setCatName("");setCatBudget("");setCatEmoji("📦");setCatColor("#7c3aed");setShowCatEmoji(false);showToast("Category added ✓");}} style={{padding:"9px 16px",background:"#7c3aed",color:"#fff",border:"none",borderRadius:9,fontWeight:600,fontSize:14}}>Add</button>
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {categories.map(cat=>(
                <div key={cat.name} className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:12,padding:"11px 14px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:32,height:32,borderRadius:8,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,border:`1px solid ${cat.color}30`,flexShrink:0}}>{cat.emoji}</div>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{cat.name}</div><div style={{fontSize:11,color:"#4b5280"}}>${fmt(cat.budget+cat.carryover)}/mo</div></div>
                  <button onClick={()=>{setModal({type:"budget",cat});setEditBudgetVal(cat.budget.toString());}} style={{padding:"5px 10px",background:"#141726",color:"#9ca3c0",border:"none",borderRadius:7,fontSize:12}}>Edit</button>
                  <button onClick={()=>persist(categories.filter(c=>c.name!==cat.name),null,null,null)} style={{padding:"5px 10px",background:"#141726",color:"#ef4444",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                </div>
              ))}
            </div>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Budget Templates</div>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <input value={tmplName} onChange={e=>setTmplName(e.target.value)} placeholder="Template name" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:13,outline:"none"}}/>
                <button onClick={()=>{if(!tmplName.trim()||categories.length===0)return;const t=[...templates,{name:tmplName.trim(),categories:categories.map(c=>({name:c.name,emoji:c.emoji,color:c.color,budget:c.budget})),income:income,fixedExpenses:fixed.map(f=>({...f}))}];persistTemplates(t);setTmplName("");showToast("Template saved ✓");}} style={{padding:"9px 14px",background:"#252840",color:"#a78bfa",border:"none",borderRadius:9,fontWeight:600,fontSize:13}}>Save</button>
              </div>
              {templates.length===0?<div style={{fontSize:12,color:"#3d4268",textAlign:"center",padding:"8px 0"}}>Save your current setup as a reusable template</div>
              :templates.map((t,i)=>(
                <div key={i} style={{background:"#0a0c14",border:"1px solid #1e2140",borderRadius:10,padding:"10px 12px",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{t.name}</div>
                      <div style={{fontSize:10,color:"#4b5280"}}>{t.categories.length} categories{t.income?` · $${fmt(t.income)} income`:""}{ (t.fixedExpenses||[]).length>0?` · ${t.fixedExpenses.length} fixed`:""}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setModal({type:"templateLoad",tmpl:t})} style={{padding:"5px 12px",background:"#7c3aed22",color:"#a78bfa",border:"1px solid #7c3aed33",borderRadius:7,fontSize:12,fontWeight:600}}>Load</button>
                      <button onClick={()=>persistTemplates(templates.filter((_,j)=>j!==i))} style={{padding:"5px 10px",background:"#141726",color:"#ef4444",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                    </div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {t.categories.map(c=>(
                      <div key={c.name} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",background:c.color+"18",border:`1px solid ${c.color}33`,borderRadius:100,fontSize:11,color:c.color,fontWeight:600}}>
                        <span>{c.emoji}</span>{c.name}<span style={{color:c.color+"99",fontFamily:"'Space Mono',monospace",fontSize:10}}>${fmt(c.budget)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="card" style={{background:"#0c0e18",border:"1px solid #141726",borderRadius:14,padding:16}}>
              <div style={{fontSize:9,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:12}}>Accounts (Net Worth)</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <button onClick={()=>setShowAccEmoji(!showAccEmoji)} style={{width:42,height:42,borderRadius:10,background:"#141726",border:"1px solid #252840",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{accEmoji}</button>
                <input value={accName} onChange={e=>setAccName(e.target.value)} placeholder="Account name (e.g. Checking)" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
              </div>
              {showAccEmoji&&<div style={{display:"flex",flexWrap:"wrap",gap:4,background:"#0a0c14",borderRadius:10,padding:10,marginBottom:8,border:"1px solid #1e2140"}}>{EMOJIS.map(e=><button key={e} className="eopt" onClick={()=>{setAccEmoji(e);setShowAccEmoji(false);}} style={{width:34,height:34,fontSize:18,background:"none",border:"none",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",transition:"transform 0.1s"}}>{e}</button>)}</div>}
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input value={accBal} onChange={e=>setAccBal(e.target.value)} type="number" placeholder="Current balance ($)" style={{flex:1,background:"#141726",border:"1px solid #252840",borderRadius:9,padding:"9px 12px",color:"#e2e4f0",fontSize:14,outline:"none"}}/>
                <button onClick={()=>{if(!accName.trim())return;const a=[...accounts,{name:accName.trim(),emoji:accEmoji,balance:+accBal||0}];persistAccounts(a);setAccName("");setAccBal("");setAccEmoji("🏦");showToast("Account added ✓");}} style={{padding:"9px 16px",background:"#059669",color:"#fff",border:"none",borderRadius:9,fontWeight:600,fontSize:14}}>Add</button>
              </div>
              {accounts.map((a,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:18,flexShrink:0}}>{a.emoji}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{a.name}</div>
                    {editAccIdx===i?(
                      <div style={{display:"flex",gap:6,marginTop:4}}>
                        <input autoFocus value={editAccBal} onChange={e=>setEditAccBal(e.target.value)} type="number" style={{width:100,background:"#141726",border:"1px solid #252840",borderRadius:7,padding:"4px 8px",color:"#e2e4f0",fontSize:13,outline:"none"}}/>
                        <button onClick={()=>{const u=[...accounts];u[i]={...u[i],balance:+parseFloat(editAccBal).toFixed(2)};persistAccounts(u);setEditAccIdx(null);showToast("Updated ✓");}} style={{padding:"4px 10px",background:"#10b981",color:"#fff",border:"none",borderRadius:7,fontSize:12,fontWeight:600}}>Save</button>
                        <button onClick={()=>setEditAccIdx(null)} style={{padding:"4px 8px",background:"#141726",color:"#6b7299",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                      </div>
                    ):(
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:a.balance>=0?"#34d399":"#f87171"}}>${fmt(a.balance)}</div>
                    )}
                  </div>
                  {editAccIdx!==i&&<>
                    <button onClick={()=>{setEditAccIdx(i);setEditAccBal(a.balance.toString());}} style={{padding:"5px 10px",background:"#141726",color:"#9ca3c0",border:"none",borderRadius:7,fontSize:12}}>Edit</button>
                    <button onClick={()=>persistAccounts(accounts.filter((_,j)=>j!==i))} style={{padding:"5px 10px",background:"#141726",color:"#ef4444",border:"none",borderRadius:7,fontSize:12}}>✕</button>
                  </>}
                </div>
              ))}
            </div>
            <button onClick={exportCSV} style={{width:"100%",padding:"13px 0",background:"#0c0e18",border:"1px solid #252840",color:"#9ca3c0",borderRadius:12,fontWeight:600,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span>⬇️</span> Export All Transactions (CSV)
            </button>
          </div>
        )}
      </div>

      {/* FAB */}
      {view!=="manage"&&categories.length>0&&(
        <button className="fab" onClick={()=>{const def=lastCat&&categories.find(c=>c.name===lastCat)?lastCat:categories[0].name;setQaCat(def);setQaAmt("");setQaNote("");setModal({type:"quickAdd"});}}
          style={{position:"fixed",bottom:"calc(24px + env(safe-area-inset-bottom))",right:20,width:54,height:54,borderRadius:"50%",background:"linear-gradient(135deg,#7c3aed,#5b21b6)",border:"none",color:"#fff",fontSize:28,fontWeight:300,zIndex:80,boxShadow:"0 4px 22px #7c3aed77",display:"flex",alignItems:"center",justifyContent:"center"}}>
          +
        </button>
      )}

      {/* MODALS */}
      {modal&&(
        <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"#000000aa",zIndex:100,display:"flex",alignItems:"flex-end"}}>
          <div className="sheet" onClick={e=>e.stopPropagation()} style={{background:"#0c0e18",borderRadius:"20px 20px 0 0",padding:"22px 20px",paddingBottom:"calc(28px + env(safe-area-inset-bottom))",width:"100%",border:"1px solid #1e2140",borderBottom:"none",maxHeight:"92vh",overflowY:"auto"}}>

            {modal.type==="quickAdd"&&(
              <>
                <div style={{fontWeight:700,fontSize:18,marginBottom:16}}>Quick Add Spend</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:10,color:"#4b5280",marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Category</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {categories.map(cat=>(
                      <button key={cat.name} onClick={()=>setQaCat(cat.name)} style={{padding:"7px 12px",background:qaCat===cat.name?cat.color+"33":"#141726",color:qaCat===cat.name?cat.color:"#9ca3c0",border:`1px solid ${qaCat===cat.name?cat.color+"55":"#252840"}`,borderRadius:20,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                        <span>{cat.emoji}</span>{cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",background:"#141726",borderRadius:12,padding:"12px 16px",marginBottom:10}}>
                  <span style={{fontSize:22,color:"#6b7299",marginRight:8}}>$</span>
                  <input autoFocus value={qaAmt} onChange={e=>setQaAmt(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" style={{flex:1,background:"none",border:"none",color:"#e2e4f0",fontSize:28,fontFamily:"'Space Mono',monospace",outline:"none"}}/>
                </div>
                <input value={qaNote} onChange={e=>setQaNote(e.target.value)} placeholder="Note (optional)" style={{width:"100%",background:"#141726",border:"1px solid #252840",borderRadius:10,padding:"10px 14px",color:"#e2e4f0",fontSize:14,marginBottom:14,outline:"none"}}/>
                <button onClick={()=>{const amt=parseFloat(qaAmt);if(!amt||!qaCat)return;logSpend(qaCat,amt,qaNote);setModal(null);}} style={{width:"100%",padding:"14px 0",background:"#7c3aed",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16}}>Log Spend</button>
              </>
            )}

            {modal.type==="spend"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{width:34,height:34,borderRadius:9,background:modal.cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{modal.cat.emoji}</div>
                  <div style={{fontWeight:700,fontSize:18}}>Log Spend — {modal.cat.name}</div>
                </div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:18}}>${fmt((modal.cat.budget+modal.cat.carryover)-modal.cat.spent)} remaining</div>
                <div style={{display:"flex",alignItems:"center",background:"#141726",borderRadius:12,padding:"12px 16px",marginBottom:10}}>
                  <span style={{fontSize:22,color:"#6b7299",marginRight:8}}>$</span>
                  <input autoFocus value={spendAmt} onChange={e=>setSpendAmt(e.target.value)} type="number" min="0" step="0.01" style={{flex:1,background:"none",border:"none",color:"#e2e4f0",fontSize:28,fontFamily:"'Space Mono',monospace",outline:"none"}}/>
                </div>
                <input value={spendNote} onChange={e=>setSpendNote(e.target.value)} placeholder="Note (optional)" style={{width:"100%",background:"#141726",border:"1px solid #252840",borderRadius:10,padding:"10px 14px",color:"#e2e4f0",fontSize:14,marginBottom:14,outline:"none"}}/>
                <button onClick={()=>{const amt=parseFloat(spendAmt);if(!amt||amt<=0)return;logSpend(modal.cat.name,amt,spendNote);setSpendAmt("");setSpendNote("");setModal(null);}} style={{width:"100%",padding:"14px 0",background:modal.cat.color,color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16}}>Log Spend</button>
              </>
            )}

            {modal.type==="budget"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <div style={{width:34,height:34,borderRadius:9,background:modal.cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{modal.cat.emoji}</div>
                  <div style={{fontWeight:700,fontSize:18}}>Edit Budget — {modal.cat.name}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",background:"#141726",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
                  <span style={{fontSize:22,color:"#6b7299",marginRight:8}}>$</span>
                  <input autoFocus value={editBudgetVal} onChange={e=>setEditBudgetVal(e.target.value)} type="number" min="0" style={{flex:1,background:"none",border:"none",color:"#e2e4f0",fontSize:28,fontFamily:"'Space Mono',monospace",outline:"none"}}/>
                </div>
                <button onClick={()=>{const amt=parseFloat(editBudgetVal);if(isNaN(amt))return;persist(categories.map(c=>c.name===modal.cat.name?{...c,budget:+amt.toFixed(2)}:c),null,null,null);setModal(null);showToast("Budget updated ✓");}} style={{width:"100%",padding:"14px 0",background:"#7c3aed",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16}}>Save Budget</button>
              </>
            )}

            {modal.type==="income"&&(
              <>
                <div style={{fontWeight:700,fontSize:18,marginBottom:4}}>Set Monthly Income</div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:18}}>Your take-home pay per month</div>
                <div style={{display:"flex",alignItems:"center",background:"#141726",borderRadius:12,padding:"12px 16px",marginBottom:16}}>
                  <span style={{fontSize:22,color:"#6b7299",marginRight:8}}>$</span>
                  <input autoFocus value={incomeInput} onChange={e=>setIncomeInput(e.target.value)} type="number" min="0" style={{flex:1,background:"none",border:"none",color:"#e2e4f0",fontSize:28,fontFamily:"'Space Mono',monospace",outline:"none"}}/>
                </div>
                <button onClick={()=>{const v=parseFloat(incomeInput);if(isNaN(v))return;persist(null,+v.toFixed(2),null,null);setModal(null);showToast("Income saved ✓");}} style={{width:"100%",padding:"14px 0",background:"#059669",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16}}>Save Income</button>
              </>
            )}

            {modal.type==="deposit"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{width:34,height:34,borderRadius:9,background:"#1d4ed822",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{modal.sv.emoji||"🏦"}</div>
                  <div style={{fontWeight:700,fontSize:18}}>Deposit — {modal.sv.name}</div>
                </div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:18}}>All-time saved: ${fmt((modal.sv.totalDeposited||0)+modal.sv.deposited)}</div>
                <div style={{display:"flex",alignItems:"center",background:"#141726",borderRadius:12,padding:"12px 16px",marginBottom:14}}>
                  <span style={{fontSize:22,color:"#6b7299",marginRight:8}}>$</span>
                  <input autoFocus value={depAmt} onChange={e=>setDepAmt(e.target.value)} type="number" min="0" step="0.01" style={{flex:1,background:"none",border:"none",color:"#e2e4f0",fontSize:28,fontFamily:"'Space Mono',monospace",outline:"none"}}/>
                </div>
                <button onClick={()=>{const amt=parseFloat(depAmt);if(!amt||amt<=0)return;const u=savings.map((s,i)=>i!==modal.svIdx?s:{...s,deposited:+(s.deposited+amt).toFixed(2),transactions:[{amount:amt,date:new Date().toLocaleDateString()},...(s.transactions||[])]});persist(null,null,u,null);setDepAmt("");setModal(null);showToast(`$${fmt(amt)} deposited ✓`);}} style={{width:"100%",padding:"14px 0",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:12,fontWeight:700,fontSize:16}}>Deposit</button>
              </>
            )}

            {modal.type==="savHistory"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{width:32,height:32,borderRadius:8,background:"#1d4ed822",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{modal.sv.emoji||"🏦"}</div>
                  <div style={{fontWeight:700,fontSize:18}}>History — {modal.sv.name}</div>
                </div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:16}}>{(modal.sv.transactions||[]).length} deposit{(modal.sv.transactions||[]).length!==1?"s":""} this month</div>
                {(modal.sv.transactions||[]).length===0
                  ?<div style={{textAlign:"center",color:"#3d4268",padding:"30px 0",fontSize:13}}>No deposits yet this month</div>
                  :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {(modal.sv.transactions||[]).map((tx,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:"#0a0c14",borderRadius:10,border:"1px solid #1e2140"}}>
                        <div style={{fontSize:11,color:"#4b5280"}}>{tx.date}</div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#60a5fa",fontWeight:700}}>+${fmt(tx.amount)}</div>
                      </div>
                    ))}
                  </div>
                }
              </>
            )}

            {modal.type==="templateLoad"&&(
              <>
                <div style={{fontWeight:700,fontSize:18,marginBottom:4}}>Load Template</div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:16}}>"{modal.tmpl.name}" — choose how to apply it</div>
                <div style={{fontSize:10,color:"#4b5280",letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Categories</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                  {modal.tmpl.categories.map(c=>(
                    <div key={c.name} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:c.color+"18",border:`1px solid ${c.color}33`,borderRadius:100,fontSize:12,color:c.color,fontWeight:600}}>
                      <span>{c.emoji}</span>{c.name}<span style={{color:c.color+"99",fontFamily:"'Space Mono',monospace",fontSize:10,marginLeft:2}}>${fmt(c.budget)}/mo</span>
                    </div>
                  ))}
                </div>
                {(modal.tmpl.income>0||(modal.tmpl.fixedExpenses||[]).length>0)&&(
                  <div style={{background:"#141726",borderRadius:10,padding:"10px 14px",marginBottom:16,display:"flex",gap:16}}>
                    {modal.tmpl.income>0&&<div style={{fontSize:12,color:"#34d399"}}>💰 Income: ${fmt(modal.tmpl.income)}/mo</div>}
                    {(modal.tmpl.fixedExpenses||[]).length>0&&<div style={{fontSize:12,color:"#f87171"}}>📌 {modal.tmpl.fixedExpenses.length} fixed</div>}
                  </div>
                )}
                <div style={{background:"#0a0c14",border:"1px solid #1e2140",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#6b7299"}}>
                  <div style={{marginBottom:6}}><span style={{color:"#a78bfa",fontWeight:700}}>Replace</span> — clears current setup and loads template fresh.</div>
                  <div><span style={{color:"#34d399",fontWeight:700}}>Merge</span> — adds template categories that don't already exist.</div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <button onClick={()=>{persist(modal.tmpl.categories.map(c=>mkCat(c.name,c.emoji,c.color,c.budget)),modal.tmpl.income||income,null,(modal.tmpl.fixedExpenses||[]).length>0?modal.tmpl.fixedExpenses:fixed);setModal(null);showToast("Template loaded ✓");}} style={{flex:1,padding:"13px 0",background:"linear-gradient(135deg,#7c3aed,#5b21b6)",color:"#fff",border:"none",borderRadius:11,fontWeight:700,fontSize:14}}>Replace</button>
                  <button onClick={()=>{const ex=new Set(categories.map(c=>c.name.toLowerCase()));const add=modal.tmpl.categories.filter(c=>!ex.has(c.name.toLowerCase())).map(c=>mkCat(c.name,c.emoji,c.color,c.budget));if(!add.length){showToast("All categories already exist","err");setModal(null);return;}persist([...categories,...add],null,null,null);setModal(null);showToast(`${add.length} categories merged ✓`);}} style={{flex:1,padding:"13px 0",background:"#10b98122",color:"#34d399",border:"1px solid #10b98133",borderRadius:11,fontWeight:700,fontSize:14}}>Merge</button>
                </div>
                <button onClick={()=>setModal(null)} style={{width:"100%",padding:"11px 0",background:"#141726",color:"#6b7299",border:"none",borderRadius:11,fontWeight:600,fontSize:14}}>Cancel</button>
              </>
            )}

            {modal.type==="confirmDelete"&&(
              <>
                <div style={{fontWeight:700,fontSize:18,marginBottom:8}}>Delete Fixed Expense?</div>
                <div style={{color:"#6b7299",fontSize:14,marginBottom:24}}>Remove <span style={{color:"#e2e4f0",fontWeight:600}}>{modal.name}</span>? This can't be undone.</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{persist(null,null,null,fixed.filter((_,j)=>j!==modal.idx));setModal(null);showToast("Removed ✓");}} style={{flex:1,padding:"13px 0",background:"#ef4444",color:"#fff",border:"none",borderRadius:11,fontWeight:700,fontSize:15}}>Delete</button>
                  <button onClick={()=>setModal(null)} style={{flex:1,padding:"13px 0",background:"#141726",color:"#6b7299",border:"none",borderRadius:11,fontWeight:600,fontSize:15}}>Cancel</button>
                </div>
              </>
            )}

            {modal.type==="history"&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                  <div style={{width:32,height:32,borderRadius:8,background:modal.cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{modal.cat.emoji}</div>
                  <div style={{fontWeight:700,fontSize:18}}>History — {modal.cat.name}</div>
                </div>
                <div style={{color:"#6b7299",fontSize:13,marginBottom:16}}>{modal.cat.transactions.length} transaction{modal.cat.transactions.length!==1?"s":""} this month</div>
                {modal.cat.transactions.length===0
                  ?<div style={{textAlign:"center",color:"#3d4268",padding:"30px 0",fontSize:13}}>No transactions yet this month</div>
                  :<div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {modal.cat.transactions.map((tx,i)=>(
                      <div key={i} className="txn" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"#0a0c14",borderRadius:10,border:"1px solid #1e2140"}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"#e2e4f0"}}>{tx.note||"Expense"}</div>
                          <div style={{fontSize:11,color:"#4b5280",marginTop:2}}>{tx.date}</div>
                        </div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:modal.cat.color,fontWeight:700}}>-${fmt(tx.amount)}</div>
                      </div>
                    ))}
                  </div>
                }
              </>
            )}

          </div>
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:"calc(80px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:toast.type==="err"?"#7f1d1d":"#1a1f35",border:`1px solid ${toast.type==="err"?"#ef444433":"#3d4580"}`,color:toast.type==="err"?"#fca5a5":"#a5b4fc",padding:"10px 20px",borderRadius:100,fontSize:13,fontWeight:600,zIndex:200,whiteSpace:"nowrap",boxShadow:"0 4px 20px #00000088"}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
