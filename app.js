const DATA = window.WC_DATA || {};
const GROUPS = DATA.groups || {};
const SCHEDULE = DATA.schedule || {};
const QUESTIONS = DATA.questions || {};
const LINEUPS = DATA.lineups || {};
const TEAM_RU = DATA.teamRuNames || {};
const ROUND_SCHEMA = DATA.roundOf32Schema || [];
const ROUND_NAMES = DATA.roundNames || ["1/16", "1/8", "1/4", "1/2", "Final"];

const content = document.querySelector("#content");
let currentPage = "groups";
let selectedGroup = Object.keys(GROUPS)[0] || "Group A";
let selectedPredictTab = Object.keys(SCHEDULE)[0] || "11 Jun";
let groupsScrollX = 0;
let datesScrollX = 0;
let activeScoreTarget = null;

const state = JSON.parse(localStorage.getItem("wc2026_state_v1") || "{}");
state.groupScores ||= {};
state.koScores ||= {"1/16":{},"1/8":{},"1/4":{},"1/2":{},"Final":{}};
state.answers ||= {};

function save(){ localStorage.setItem("wc2026_state_v1", JSON.stringify(state)); }
function teamName(t){ return Array.isArray(t) ? t[0] : (t.name || t); }
function teamCode(t){ return Array.isArray(t) ? t[1] : (t.code || ""); }
function teamRu(t){ return TEAM_RU[t] || t; }
function flagSrc(code){ return code ? `https://flagcdn.com/w80/${code}.png` : ""; }
function safeInt(v){ if(v === "" || v == null) return null; const n = Number(v); return Number.isInteger(n) ? n : null; }
function groupLetter(g){ return g.replace("Group ", ""); }
function key(...parts){ return parts.join("__"); }
function qKey(a,b){ return `${a}__${b}`; }
function getMatches(){ return Object.entries(SCHEDULE).flatMap(([date, matches]) => matches.map(m => ({date, group:m[0], team1:{name:m[1][0],code:m[1][1]}, team2:{name:m[2][0],code:m[2][1]}}))); }
function matchTime(date, idx, count){ const slots={1:["22:00 МСК"],2:["19:00 МСК","22:00 МСК"],4:["16:00 МСК","19:00 МСК","22:00 МСК","01:00 МСК"],8:["13:00 МСК","16:00 МСК","19:00 МСК","22:00 МСК","01:00 МСК","04:00 МСК","07:00 МСК","10:00 МСК"]}; return (slots[count]||slots[4])[idx % (slots[count]||slots[4]).length]; }
function ensureGroupScores(){ getMatches().forEach(m=>{ const k=key(m.group,m.team1.name,m.team2.name); state.groupScores[k] ||= ["",""]; }); }
ensureGroupScores();

function tables(){
  const result={};
  Object.entries(GROUPS).forEach(([g, teams])=>{
    const table={};
    teams.forEach(t=>{ table[teamName(t)]={name:teamName(t),code:teamCode(t),P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,PTS:0}; });
    getMatches().filter(m=>m.group===g).forEach(m=>{
      const s=state.groupScores[key(m.group,m.team1.name,m.team2.name)] || ["",""];
      const a=safeInt(s[0]), b=safeInt(s[1]); if(a===null||b===null) return;
      const t1=table[m.team1.name], t2=table[m.team2.name]; if(!t1||!t2) return;
      t1.P++; t2.P++; t1.GF+=a; t1.GA+=b; t2.GF+=b; t2.GA+=a; t1.GD=t1.GF-t1.GA; t2.GD=t2.GF-t2.GA;
      if(a>b){t1.W++;t1.PTS+=3;t2.L++;} else if(b>a){t2.W++;t2.PTS+=3;t1.L++;} else {t1.D++;t2.D++;t1.PTS++;t2.PTS++;}
    });
    result[g]=Object.values(table).sort((a,b)=>b.PTS-a.PTS||b.GD-a.GD||b.GF-a.GF||a.GA-b.GA||a.name.localeCompare(b.name));
  });
  return result;
}
function allGroupsFilled(){ return Object.values(state.groupScores).every(s=>safeInt(s[0])!==null && safeInt(s[1])!==null); }
function positions(){
  const pos={}, thirds=[]; const t=tables();
  Object.entries(t).forEach(([g, tab])=>{ const l=groupLetter(g); tab.forEach((team,i)=>{ const x={...team, group:l, position:i+1}; if(i===0)pos[`1${l}`]=x; else if(i===1)pos[`2${l}`]=x; else if(i===2)thirds.push(x); }); });
  thirds.sort((a,b)=>b.PTS-a.PTS||b.GD-a.GD||b.GF-a.GF||a.GA-b.GA); return [pos, thirds.slice(0,8)];
}
function placeholder(slot){ if(slot[0]==="1") return {name:`Winner Group ${slot[1]}`,code:"",slot}; if(slot[0]==="2") return {name:`Runner-up Group ${slot[1]}`,code:"",slot}; return {name:`3rd Group ${slot.slice(1).split("").join("/")}`,code:"",slot}; }
function round32Pairs(){
  const [pos,thirds]=positions(); const used=new Set();
  function choose(slot){
    if(!allGroupsFilled()) return placeholder(slot);
    if(slot[0]==="1"||slot[0]==="2") return pos[slot] || placeholder(slot);
    const allowed=slot.slice(1).split(""); let cand=thirds.filter(t=>allowed.includes(t.group)&&!used.has(t.group)); if(!cand.length)cand=thirds.filter(t=>!used.has(t.group)); if(!cand.length)cand=thirds;
    const team=cand[0] || placeholder(slot); if(team.group) used.add(team.group); return team;
  }
  return ROUND_SCHEMA.map(([a,b])=>[choose(a),choose(b)]);
}
function koWinner(round, i, a, b){
  const s=state.koScores[round]?.[i] || ["", "", "", ""]; const x=safeInt(s[0]), y=safeInt(s[1]); if(x===null||y===null) return null;
  if(x>y) return a; if(y>x) return b; const p1=safeInt(s[2]), p2=safeInt(s[3]); if(p1===null||p2===null) return null; return p1>=p2 ? a : b;
}
function roundComplete(round){ const pairs=buildRounds()[round]||[]; return pairs.length && pairs.every((p,i)=>!!koWinner(round,i,p[0],p[1])); }
function buildRounds(){
  const rounds={"1/16":round32Pairs()}; let prev=rounds["1/16"];
  ["1/8","1/4","1/2","Final"].forEach((rn)=>{ const prevName=ROUND_NAMES[ROUND_NAMES.indexOf(rn)-1]; const winners=prev.map((p,i)=>koWinner(prevName,i,p[0],p[1]) || {name:`Winner Match ${i+1}`,code:"",slot:`W${i+1}`}); const pairs=[]; for(let i=0;i<winners.length;i+=2) if(winners[i+1]) pairs.push([winners[i],winners[i+1]]); rounds[rn]=pairs; prev=pairs; });
  return rounds;
}
function predictTabs(){ const tabs=Object.keys(SCHEDULE); if(allGroupsFilled()) tabs.push("1/16"); ["1/8","1/4","1/2","Final"].forEach(r=>{ const prev=ROUND_NAMES[ROUND_NAMES.indexOf(r)-1]; if(prev && roundComplete(prev)) tabs.push(r); }); return tabs; }

function render(){
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active", b.dataset.page===currentPage));
  if(currentPage==="groups") renderGroups(); else if(currentPage==="predict") renderPredict(); else renderPlayoffs();
  setTimeout(enableDragScroll,0);
}
function renderGroups(){
  const groupNames=Object.keys(GROUPS); if(!groupNames.includes(selectedGroup)) selectedGroup=groupNames[0]; const tab=tables()[selectedGroup]||[];
  content.innerHTML=`<section class="screen"><div class="card hero"><div class="small">FIFA WORLD CUP</div><div class="big">UNITED 2026</div><div class="host">CANADA · USA · MEXICO</div></div><div class="pills">${groupNames.map(g=>`<button class="pill ${g===selectedGroup?'active':''}" data-group="${g}">${g}</button>`).join('')}</div><div class="card"><div class="table"><div class="th">#</div><div></div><div class="th" style="text-align:left">Team</div><div class="th">P</div><div class="th">W</div><div class="th">D</div><div class="th">L</div><div class="th">GD</div><div class="th">PTS</div>${tab.map((t,i)=>`<div class="pos ${i<2?'q1':i===2?'q3':''}">${i+1}</div><img class="flag" src="${flagSrc(t.code)}"><div class="team-name">${t.name}</div><div class="cell">${t.P}</div><div class="cell">${t.W}</div><div class="cell">${t.D}</div><div class="cell">${t.L}</div><div class="cell">${t.GD}</div><div class="cell pts">${t.PTS}</div>`).join('')}</div></div><div class="card legend"><div style="color:var(--green)">Direct qualification to knockout stage</div><div style="color:var(--gold)">Possible qualification as best third-placed team</div></div></section>`;
  const pills = document.querySelector(".pills");

if (pills) {
  pills.scrollLeft = groupsScrollX;

  pills.addEventListener("scroll", () => {
    groupsScrollX = pills.scrollLeft;
  });
}
  document.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{selectedGroup=b.dataset.group;renderGroups();setTimeout(enableDragScroll,0);});
}
function renderPredict(){
  const tabs=predictTabs(); if(!tabs.includes(selectedPredictTab)) selectedPredictTab=tabs[0];
  let body='';
  if(SCHEDULE[selectedPredictTab]){
    const matches=SCHEDULE[selectedPredictTab]; body=matches.map((m,i)=>matchCard({date:selectedPredictTab,idx:i,count:matches.length,group:m[0],team1:{name:m[1][0],code:m[1][1]},team2:{name:m[2][0],code:m[2][1]}})).join('');
  } else {
    const pairs=buildRounds()[selectedPredictTab]||[]; body=pairs.map((p,i)=>koPredictCard(selectedPredictTab,i,p[0],p[1])).join('') || `<div class="card locked">Заверши предыдущий этап</div>`;
  }
  content.innerHTML=`<section class="screen"><div class="title">Predictions</div><div class="pills">${tabs.map(t=>`<button class="pill ${t===selectedPredictTab?'active':''}" data-tab="${t}">${t}${pointsForDate(t)?` +${pointsForDate(t)}`:''}</button>`).join('')}</div><div class="sub">${selectedPredictTab}${SCHEDULE[selectedPredictTab]?' 2026':''}</div><div class="points">Потенциальные очки: +${pointsForDate(selectedPredictTab)}</div>${body}</section>`;
  const pills = document.querySelector(".pills");

if (pills) {
  pills.scrollLeft = datesScrollX;

  pills.addEventListener("scroll", () => {
    datesScrollX = pills.scrollLeft;
  });
}
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{selectedPredictTab=b.dataset.tab;renderPredict();setTimeout(enableDragScroll,0);}); bindInputs();
}
function matchCard(m){ const k=key(m.group,m.team1.name,m.team2.name); const s=state.groupScores[k]||["",""]; const filled=safeInt(s[0])!==null&&safeInt(s[1])!==null;
  return `<div class="card"><div class="match-head">${m.group}</div><div class="match-time">${matchTime(m.date,m.idx,m.count)}</div><div class="match-row"><div class="team"><img class="flag" src="${flagSrc(m.team1.code)}"><div>${m.team1.name}</div></div><div><div class="score"><input readonly placeholder="•" value="${s[0]}" data-kind="group" data-key="${k}" data-index="0"><span class="dash">-</span><input readonly placeholder="•" value="${s[1]}" data-kind="group" data-key="${k}" data-index="1"></div><div class="hint">Нажми на счёт</div></div><div class="team"><img class="flag" src="${flagSrc(m.team2.code)}"><div>${m.team2.name}</div></div></div><div class="save">Сохраняется автоматически</div>${filled?extraPredictions(m.team1.name,m.team2.name):''}</div>`; }
function koPredictCard(r,i,a,b){ state.koScores[r] ||= {}; state.koScores[r][i] ||= ["", "", "", ""]; const s=state.koScores[r][i]; const draw=safeInt(s[0])!==null&&safeInt(s[0])===safeInt(s[1]);
  return `<div class="card"><div class="match-head">${r} • Match ${i+1}</div><div class="match-row"><div class="team">${teamVisual(a,62)}</div><div><div class="score"><input readonly placeholder="•" value="${s[0]}" data-kind="ko" data-round="${r}" data-match="${i}" data-index="0"><span class="dash">-</span><input readonly placeholder="•" value="${s[1]}" data-kind="ko" data-round="${r}" data-match="${i}" data-index="1"></div><div class="hint">Нажми на счёт</div>${draw?`<div class="pens"><input readonly placeholder="•" value="${s[2]}" data-kind="ko" data-round="${r}" data-match="${i}" data-index="2"><span class="dash">-</span><input readonly placeholder="•" value="${s[3]}" data-kind="ko" data-round="${r}" data-match="${i}" data-index="3"></div>`:''}</div><div class="team">${teamVisual(b,62)}</div></div><div class="save">Сохраняется автоматически</div>${safeInt(s[0])!==null&&safeInt(s[1])!==null?extraPredictions(a.name,b.name,true):''}</div>`; }
function teamVisual(t,size=30){ return `${t.code?`<img class="flag" style="width:${size}px;height:${size}px" src="${flagSrc(t.code)}">`:`<div class="empty-dot" style="width:${size}px;height:${size}px"></div>`}<div>${t.name}</div>`; }
function questionsFor(a,b){ return QUESTIONS[qKey(a,b)]||QUESTIONS[qKey(b,a)]||["Будет ли забит гол в первом тайме?","Забьют ли обе команды?","Будет ли тотал больше 2.5 голов?",`Сможет ли ${teamRu(a)} не проиграть?`,"Кто станет игроком матча?"]; }
function extraPredictions(a,b){ const qs=questionsFor(a,b); return `<div class="extra"><h3>Дополнительные прогнозы</h3>${qs.map((q,i)=>`<div class="question">${i+1}. ${q}</div>${answersFor(q,a,b).map(ans=>{const k=key(a,b,q); const active=state.answers[k]?.answer===ans || (ans==='＋ Выбрать игрока'&&state.answers[k]); const label=(ans==='＋ Выбрать игрока'&&state.answers[k])?state.answers[k].answer:ans; const pts=pointsForQuestion(q); return `<button class="answer ${active?'active':''}" data-a="${a}" data-b="${b}" data-q="${q}" data-ans="${ans}" data-pts="${pts}">${label} +${pts} очков</button>`;}).join('')}`).join('')}</div>`; }
function answersFor(q,a,b){ const s=q.toLowerCase(); if(s.includes('кто станет игроком')||s.includes('лучший игрок')) return ['＋ Выбрать игрока']; if(s.includes('какая команда')) return [teamRu(a),teamRu(b)]; if(s.includes('кто забьёт первый')||s.includes('кто откроет')) return [teamRu(a),teamRu(b),'Без гола']; return ['Да','Нет']; }
function pointsForQuestion(q){ const s=q.toLowerCase(); if(s.includes('игроком матча')) return 20; if(s.includes('кто забьёт')||s.includes('кто откроет')) return 12; if(s.includes('какая команда')) return 10; return 8; }
function pointsForDate(date){ return Object.values(state.answers).filter(x=>x.date===date).reduce((a,b)=>a+b.points,0); }
function bindInputs(){
  document.querySelectorAll('input[data-kind]').forEach(inp=>inp.onclick=()=>{activeScoreTarget=inp;openNumpad();});
  document.querySelectorAll('.answer').forEach(btn=>btn.onclick=()=>{ const a=btn.dataset.a,b=btn.dataset.b,q=btn.dataset.q,ans=btn.dataset.ans,pts=+btn.dataset.pts; if(ans==='＋ Выбрать игрока') return openPlayerSelect(a,b,q,pts); state.answers[key(a,b,q)]={answer:ans,points:pts,date:selectedPredictTab}; save(); renderPredict(); });
}
function openPlayerSelect(a,b,q,pts){ const modal=document.createElement('div'); modal.className='modal'; const players=(team)=>LINEUPS[team]||Array.from({length:11},(_,i)=>`Игрок ${i+1}`); modal.innerHTML=`<div class="sheet"><h3>Выбор игрока матча</h3><div class="question">${q}</div><div class="sub">${teamRu(a)}</div>${players(a).map(p=>`<button class="player" data-team="${a}" data-player="${p}">${p}</button>`).join('')}<div class="sub">${teamRu(b)}</div>${players(b).map(p=>`<button class="player" data-team="${b}" data-player="${p}">${p}</button>`).join('')}<button class="close">Закрыть</button></div>`; document.body.appendChild(modal); modal.querySelector('.close').onclick=()=>modal.remove(); modal.querySelectorAll('.player').forEach(x=>x.onclick=()=>{state.answers[key(a,b,q)]={answer:`${x.dataset.player} (${teamRu(x.dataset.team)})`,points:pts,date:selectedPredictTab}; save(); modal.remove(); renderPredict();}); }
function openNumpad(){document.querySelector('#numpad').classList.remove('hidden');}
function closeNumpad(){document.querySelector('#numpad').classList.add('hidden');activeScoreTarget=null;save();renderPredict();}
document.querySelectorAll('#numpad button').forEach(btn=>btn.onclick=()=>{ if(!activeScoreTarget)return; const action=btn.dataset.action, v=btn.textContent.trim(); if(action==='done')return closeNumpad(); let arr; if(activeScoreTarget.dataset.kind==='group'){arr=state.groupScores[activeScoreTarget.dataset.key];} else {const r=activeScoreTarget.dataset.round,m=activeScoreTarget.dataset.match; state.koScores[r] ||= {}; state.koScores[r][m] ||= ["", "", "", ""]; arr=state.koScores[r][m];} const idx=+activeScoreTarget.dataset.index; if(action==='clear')arr[idx]=''; else if(action==='back')arr[idx]=arr[idx].slice(0,-1); else if(/^\d$/.test(v)&&arr[idx].length<2)arr[idx]+=v; activeScoreTarget.value=arr[idx]; save(); });
function renderPlayoffs(){ const rounds=buildRounds(); content.innerHTML=`<section class="screen"><div class="title">Playoff Bracket</div><div class="pills">${ROUND_NAMES.map(r=>`<button class="pill" data-roundbtn="${r}">${r}</button>`).join('')}</div><div class="bracket-scroll" id="bracketScroll">${ROUND_NAMES.map(r=>`<div class="bracket-stage" data-stage="${r}"><div class="sub">${r}</div>${(rounds[r]||[]).map((p,i)=>koBracketCard(r,i,p[0],p[1])).join('')}</div>`).join('')}</div></section>`; document.querySelectorAll('[data-roundbtn]').forEach(b=>b.onclick=()=>document.querySelector(`[data-stage="${b.dataset.roundbtn}"]`).scrollIntoView({behavior:'smooth',inline:'start'})); }
function koBracketCard(r,i,a,b){ const w=koWinner(r,i,a,b); return `<div class="bracket-card"><div class="card ko-card-main"><div class="ko-line ${w&&w.name===a.name?'active':''}">${a.code?`<img class="flag" src="${flagSrc(a.code)}">`:'<div class="empty-dot"></div>'}<span>${a.name}</span></div><div class="divider"></div><div class="ko-line ${w&&w.name===b.name?'active':''}">${b.code?`<img class="flag" src="${flagSrc(b.code)}">`:'<div class="empty-dot"></div>'}<span>${b.name}</span></div></div><div class="winner-preview">${w?(w.code?`<img class="flag" src="${flagSrc(w.code)}">`:'')+`<span>${w.name}</span>`:'<span>winner →</span>'}</div></div>`; }
function enableDragScroll(){document.querySelectorAll('.pills,.nav,.round-pager').forEach(el=>{if(el.dataset.dragEnabled)return;el.dataset.dragEnabled='1';let down=false,startX=0,left=0;el.addEventListener('mousedown',e=>{down=true;startX=e.pageX-el.offsetLeft;left=el.scrollLeft;});el.addEventListener('mouseleave',()=>down=false);el.addEventListener('mouseup',()=>down=false);el.addEventListener('mousemove',e=>{if(!down)return;e.preventDefault();el.scrollLeft=left-(e.pageX-el.offsetLeft-startX)*1.4;});el.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)){el.scrollLeft+=e.deltaY;e.preventDefault();}},{passive:false});});}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{currentPage=b.dataset.page;render();});
render();
