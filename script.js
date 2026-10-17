"use strict";
const $ = id => document.getElementById(id);
const KEY = "pixel-diary-v1";
const MAX_AMOUNT = 999999999;
const MAX_TODOS = 300;
const GAME_SECONDS = 30;
const ITEMS = [
  {id:"heart",name:"愛心糖",icon:"💗",rarity:"普通",quote:"今天的你，也值得被溫柔對待。"},
  {id:"flower",name:"小花花",icon:"🌷",rarity:"普通",quote:"慢慢來，花也有自己的花期。"},
  {id:"cake",name:"草莓糕",icon:"🍰",rarity:"普通",quote:"替自己留一口甜甜的快樂！"},
  {id:"cloud",name:"棉花雲",icon:"☁️",rarity:"普通",quote:"累了就休息，雲朵會等你。"},
  {id:"star",name:"幸運星",icon:"⭐",rarity:"稀有",quote:"你正在悄悄發光。"},
  {id:"bow",name:"蝴蝶結",icon:"🎀",rarity:"稀有",quote:"今天很適合為自己打扮心情。"},
  {id:"rainbow",name:"彩虹糖",icon:"🌈",rarity:"稀有",quote:"雨後的小確幸正在路上。"},
  {id:"moon",name:"夢幻月",icon:"🌙",rarity:"超稀有",quote:"把願望交給夜空，明天繼續努力。"}
];
const CATEGORIES = ["飲食","交通","購物","娛樂","其他"];
const defaultData = () => ({todos:[],notes:[],expenses:[],gacha:{date:"",collection:{},last:null},best:0,sound:false,bgm:false,bgmVolume:40});
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// 金額最多 2 位小數：乘以 100 後必須（在浮點誤差內）是整數。
const twoDecimals = n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

function validRecord(a, fields){return Array.isArray(a)&&a.length<=10000&&a.every(x=>x&&typeof x==="object"&&fields.every(f=>typeof x[f]==="string"));}

// strict = true：匯入 JSON 時使用，金額必須是大於 0、最多 2 位小數的數字。
// strict = false：讀取本機既有資料時使用，維持舊規則，避免舊紀錄因新規則被整批清空。
function normalize(input, strict=false){
  if(!input || typeof input!=="object" || Array.isArray(input)) throw Error("資料格式不正確");
  if(!validRecord(input.notes,["id","title","text","date"])||!validRecord(input.expenses,["id","title","date","category"])) throw Error("紀錄格式不正確");
  // 舊版備份沒有 todos 欄位，視為空清單。
  const rawTodos = input.todos===undefined ? [] : input.todos;
  if(!validRecord(rawTodos,["id","text"])) throw Error("待辦格式不正確");
  const todos=rawTodos.map(t=>({id:t.id.slice(0,100),text:t.text.slice(0,80),done:t.done===true}));
  const notes=input.notes.map(n=>({id:n.id.slice(0,100),title:n.title.slice(0,50),text:n.text.slice(0,2000),date:n.date.slice(0,10)}));
  const expenses=input.expenses.map((e,i)=>{
    const label=`第 ${i+1} 筆花費「${e.title.slice(0,20)}」`;
    if(strict){
      const amount=e.amount;
      if(typeof amount!=="number"||!Number.isFinite(amount)) throw Error(`${label}的金額不是數字`);
      if(amount<=0) throw Error(`${label}的金額必須大於 0`);
      if(amount>MAX_AMOUNT) throw Error(`${label}的金額超過上限`);
      if(!twoDecimals(amount)) throw Error(`${label}的金額最多只能有 2 位小數`);
      return {id:e.id.slice(0,100),title:e.title.slice(0,60),date:e.date.slice(0,10),category:CATEGORIES.includes(e.category)?e.category:"其他",amount:Math.round(amount*100)/100};
    }
    const amount=Number(e.amount);
    if(!Number.isFinite(amount)||amount<0||amount>MAX_AMOUNT) throw Error(`${label}的金額不正確`);
    return {id:e.id.slice(0,100),title:e.title.slice(0,60),date:e.date.slice(0,10),category:CATEGORIES.includes(e.category)?e.category:"其他",amount};
  });
  const g=input.gacha&&typeof input.gacha==="object"?input.gacha:{};
  const collection={};for(const item of ITEMS){const n=Number(g.collection?.[item.id]);if(Number.isSafeInteger(n)&&n>=1&&n<=100000)collection[item.id]=n;}
  const vol=Number(input.bgmVolume);
  return {
    todos,notes,expenses,
    gacha:{date:typeof g.date==="string"?g.date.slice(0,10):"",collection,last:typeof g.last==="string"?g.last:null},
    best:Number.isSafeInteger(input.best)&&input.best>=0?input.best:0,
    sound:input.sound===true,
    bgm:input.bgm===true,
    bgmVolume:Number.isFinite(vol)&&vol>=0&&vol<=100?Math.round(vol):40
  };
}

// 讀取失敗時先把原始資料另存一份，避免下一次儲存把它覆蓋掉。
let loadFailed=false;
function load(){let raw=null;try{raw=localStorage.getItem(KEY);return raw?normalize(JSON.parse(raw)):defaultData();}catch{loadFailed=Boolean(raw);try{if(raw)localStorage.setItem(`${KEY}-recovery`,raw);}catch{}return defaultData();}}
let data=load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(data));}catch{toast("儲存失敗，請先備份或清理瀏覽器空間");}}
function localDate(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`;}
function money(n){return `NT$${n.toLocaleString("zh-TW",{maximumFractionDigits:2})}`;}
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
let toastTimer;function toast(msg){const box=$("toast");box.textContent=msg;box.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove("show"),2800);}

// ---------- Audio：音效與背景音樂共用一個 AudioContext ----------
let audioCtx=null;
function getCtx(){
  if(!audioCtx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;try{audioCtx=new AC();}catch{return null;}}
  if(audioCtx.state==="suspended"&&!document.hidden)audioCtx.resume().catch(()=>{});
  return audioCtx;
}
function beep(freq=520){if(!data.sound)return;const c=getCtx();if(!c)return;try{const o=c.createOscillator(),g=c.createGain();o.type="square";o.frequency.value=freq;g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.12);}catch{}}

// 背景音樂：原創 8 小節循環小曲（C–Am–F–G），112 BPM，每格是八分音符。
// 「-」代表延長前一個音，「.」代表休止，「|」只是小節線方便閱讀。
const BGM_STEP=60/112/2;
const BGM_LEAD="E5 G5 C6 G5 E5 G5 A5 G5 | E5 - C5 E5 A5 - G5 E5 | F5 A5 C6 A5 G5 F5 E5 F5 | G5 - D5 G5 B5 - A5 G5 | C6 - B5 C6 G5 - E5 G5 | A5 - G5 A5 E5 - C5 E5 | D5 F5 A5 F5 E5 D5 C5 D5 | B4 D5 G5 F5 E5 - C5 .";
const BGM_BASS="C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | G2 . D3 . G2 . D3 . | C3 . G3 . C3 . G3 . | A2 . E3 . A2 . E3 . | D3 . A3 . D3 . A3 . | G2 . D3 . C3 . . .";
function noteFreq(name){const m=/^([A-G])(#?)(\d)$/.exec(name);if(!m)return 0;const midi=(Number(m[3])+1)*12+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]+(m[2]?1:0);return 440*Math.pow(2,(midi-69)/12);}
function parseTrack(str){const tokens=str.replace(/\|/g," ").trim().split(/\s+/),events=new Array(tokens.length).fill(null);tokens.forEach((tok,i)=>{if(tok==="-"||tok===".")return;let len=1;while(tokens[i+len]==="-")len++;events[i]={freq:noteFreq(tok),len};});return events;}
const LEAD_EVENTS=parseTrack(BGM_LEAD),BASS_EVENTS=parseTrack(BGM_BASS);
let bgmGain=null,bgmTimer=0,bgmStep=0,bgmNext=0;
const bgmLevel=()=>data.bgmVolume/100*0.15;
function playTone(dest,type,freq,t,dur,level){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(level,t+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+0.03);}
// 排程器：每 50ms 檢查一次，把接下來 0.2 秒內要播的音先排進 Web Audio 的時間軸，節奏才不會受畫面卡頓影響。
function bgmTick(){
  if(!audioCtx||audioCtx.state!=="running")return;
  if(bgmNext<audioCtx.currentTime-0.3)bgmNext=audioCtx.currentTime+0.05;
  while(bgmNext<audioCtx.currentTime+0.2){
    const i=bgmStep%LEAD_EVENTS.length,lead=LEAD_EVENTS[i],bass=BASS_EVENTS[i];
    if(lead)playTone(bgmGain,"square",lead.freq,bgmNext,lead.len*BGM_STEP*0.9,0.35);
    if(bass)playTone(bgmGain,"triangle",bass.freq,bgmNext,bass.len*BGM_STEP*0.85,0.7);
    bgmNext+=BGM_STEP;bgmStep++;
  }
}
function startBgm(){
  if(bgmTimer)return;const c=getCtx();if(!c)return;
  if(!bgmGain){bgmGain=c.createGain();bgmGain.connect(c.destination);}
  const t=c.currentTime;bgmGain.gain.cancelScheduledValues(t);bgmGain.gain.setValueAtTime(0,t);bgmGain.gain.linearRampToValueAtTime(bgmLevel(),t+0.5);
  bgmStep=0;bgmNext=t+0.1;bgmTimer=setInterval(bgmTick,50);bgmTick();
}
function stopBgm(){if(!bgmTimer)return;clearInterval(bgmTimer);bgmTimer=0;const t=audioCtx.currentTime;bgmGain.gain.cancelScheduledValues(t);bgmGain.gain.setValueAtTime(bgmGain.gain.value,t);bgmGain.gain.linearRampToValueAtTime(0,t+0.2);}
function syncBgm(){data.bgm?startBgm():stopBgm();updateAudioUI();}
function updateAudioUI(){
  $("soundToggle").textContent=data.sound?"♪ SFX ON":"♪ SFX OFF";$("soundToggle").setAttribute("aria-pressed",String(data.sound));
  $("bgmToggle").textContent=data.bgm?"♫ BGM ON":"♫ BGM OFF";
  $("bgmToggleSettings").textContent=data.bgm?"♫ 關閉背景音樂":"♫ 開啟背景音樂";
  document.querySelectorAll(".bgm-toggle").forEach(b=>b.setAttribute("aria-pressed",String(data.bgm)));
  $("bgmVolume").value=data.bgmVolume;$("bgmVolumeLabel").textContent=`${data.bgmVolume}%`;
}
document.querySelectorAll(".bgm-toggle").forEach(b=>b.addEventListener("click",()=>{data.bgm=!data.bgm;save();syncBgm();toast(data.bgm?"背景音樂開啟 ♫":"背景音樂關閉");}));
$("bgmVolume").addEventListener("input",e=>{data.bgmVolume=Number(e.target.value);$("bgmVolumeLabel").textContent=`${data.bgmVolume}%`;if(bgmGain&&bgmTimer)bgmGain.gain.setTargetAtTime(bgmLevel(),audioCtx.currentTime,0.05);});
$("bgmVolume").addEventListener("change",save);
// 瀏覽器規定聲音必須在使用者第一次點擊或按鍵後才能播放，所以已開啟音樂時等第一次互動再開始。
const unlockAudio=()=>{if(data.bgm)startBgm();document.removeEventListener("pointerdown",unlockAudio);document.removeEventListener("keydown",unlockAudio);};
document.addEventListener("pointerdown",unlockAudio);document.addEventListener("keydown",unlockAudio);
$("soundToggle").addEventListener("click",()=>{data.sound=!data.sound;updateAudioUI();save();beep();});

function show(view){if(view!=="game")pauseGame();document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.go===view));scrollTo({top:0,behavior:"smooth"});if(view==="home")renderTodos();if(view==="gacha")renderGacha();if(view==="money")renderExpenses();if(view==="notes")renderNotes();}
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.go)));

// ---------- Todos：首頁待辦清單 ----------
function renderTodos(){
  const list=$("todoList");list.replaceChildren();
  const total=data.todos.length,done=data.todos.filter(t=>t.done).length;
  $("todoCount").textContent=`${done} / ${total}`;
  $("todoClearDone").classList.toggle("hidden",!done);
  if(!total){list.append(el("li","todo-empty","📋 還沒有待辦，新增第一件吧！"));return;}
  // 未完成的排在前面，已完成的沉到下面；同組內保持新增順序。
  [...data.todos.filter(t=>!t.done),...data.todos.filter(t=>t.done)].forEach(t=>{
    const li=el("li","todo-item"+(t.done?" done":"")),label=el("label"),box=document.createElement("input"),del=el("button","todo-del","✕");
    box.type="checkbox";box.checked=t.done;box.dataset.id=t.id;
    box.addEventListener("change",()=>{t.done=box.checked;save();renderTodos();if(t.done){beep(880);if(data.todos.every(x=>x.done))toast("全部完成！今天好棒 ✨");}document.querySelector(`#todoList input[data-id="${CSS.escape(t.id)}"]`)?.focus();});
    label.append(box,el("span",null,t.text));
    del.type="button";del.setAttribute("aria-label",`刪除「${t.text}」`);
    del.addEventListener("click",()=>{data.todos=data.todos.filter(x=>x.id!==t.id);save();renderTodos();});
    li.append(label,del);list.append(li);
  });
}
$("todoForm").addEventListener("submit",e=>{e.preventDefault();const text=$("todoText").value.trim();if(!text)return toast("請輸入待辦內容");if(data.todos.length>=MAX_TODOS)return toast(`待辦最多 ${MAX_TODOS} 件，先清除已完成的吧`);data.todos.push({id:uid(),text:text.slice(0,80),done:false});save();$("todoText").value="";renderTodos();$("todoText").focus();});
$("todoClearDone").addEventListener("click",()=>{const n=data.todos.filter(t=>t.done).length;if(!n||!confirm(`清除 ${n} 件已完成的待辦？`))return;data.todos=data.todos.filter(t=>!t.done);save();renderTodos();toast("已清除完成的待辦 ✓");});

// Gacha: one draw per local calendar day; cosmetic only, no payment.
function renderGacha(){const done=data.gacha.date===localDate();$("gachaDraw").disabled=done;$("gachaDraw").textContent=done?"♡ 明天再來抽 ♡":"✦ 抽一顆扭蛋 ✦";$("gachaStatus").textContent=done?"今天已領到幸運":"今天的驚喜待領取";$("gachaMessage").textContent=done&&data.gacha.last?`今日抽到：${ITEMS.find(i=>i.id===data.gacha.last)?.name||"幸運"} ♡` : "準備好今天的幸運了嗎？";const grid=$("collectionGrid");grid.replaceChildren();let count=0;ITEMS.forEach(item=>{const n=data.gacha.collection[item.id]||0;if(n)count++;const card=el("div","collect-item"+(n?"":" locked"));card.append(el("span","symbol",n?item.icon:"？"),el("small",null,n?item.name:"未解鎖"),el("b",null,n?`×${n}`:"♡"));grid.append(card);});$("collectionCount").textContent=`${count} / ${ITEMS.length}`;}
let drawing=false;$("gachaDraw").addEventListener("click",()=>{if(drawing||data.gacha.date===localDate())return;drawing=true;const roll=Math.random(),pool=roll<.05?ITEMS.slice(7):roll<.3?ITEMS.slice(4,7):ITEMS.slice(0,4),item=pool[Math.floor(Math.random()*pool.length)];data.gacha.date=localDate();data.gacha.last=item.id;data.gacha.collection[item.id]=(data.gacha.collection[item.id]||0)+1;save();$("gachaDraw").disabled=true;$("gachaMachine").classList.add("shake");beep(500);setTimeout(()=>{$("gachaMachine").classList.remove("shake");drawing=false;renderGacha();$("gachaMessage").textContent=`${item.icon} ${item.rarity}・${item.name}｜${item.quote}`;beep(790);},850);});

// Notes
function resetNote(){ $("noteForm").reset();$("noteEditId").value="";$("noteDate").value=localDate();$("noteSave").textContent="♡ 保存紙條";$("noteCancel").classList.add("hidden");}
$("noteCancel").addEventListener("click",resetNote);
$("noteForm").addEventListener("submit",e=>{e.preventDefault();const title=$("noteTitle").value.trim(),text=$("noteText").value.trim(),date=$("noteDate").value,id=$("noteEditId").value;if(!title||!text||!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("請填寫標題、日期與內容");if(id){const n=data.notes.find(n=>n.id===id);if(n)Object.assign(n,{title,text,date});}else data.notes.push({id:uid(),title,text,date});save();resetNote();renderNotes();toast("紙條已保存 ♡");});
function renderNotes(){const root=$("notesList");root.replaceChildren();$("notesCount").textContent=`${data.notes.length} 則`;const sorted=[...data.notes].sort((a,b)=>b.date.localeCompare(a.date));if(!sorted.length){root.append(el("div","empty","💌 還沒有紙條，寫下第一篇吧！"));return;}sorted.forEach(n=>{const box=el("article","record"),head=el("div","record-head"),actions=el("div","record-actions"),edit=el("button",null,"編輯"),del=el("button",null,"刪除");head.append(el("h4",null,n.title),el("time",null,n.date));edit.type=del.type="button";edit.addEventListener("click",()=>{$("noteEditId").value=n.id;$("noteTitle").value=n.title;$("noteText").value=n.text;$("noteDate").value=n.date;$("noteSave").textContent="♡ 儲存修改";$("noteCancel").classList.remove("hidden");$("noteForm").scrollIntoView({behavior:"smooth"});});del.addEventListener("click",()=>{if(!confirm(`確定刪除「${n.title}」？`))return;data.notes=data.notes.filter(x=>x.id!==n.id);save();renderNotes();});actions.append(edit,del);box.append(head,el("p",null,n.text),actions);root.append(box);});}

// Expenses
function resetExpense(){$("expenseForm").reset();$("expenseEditId").value="";$("expenseDate").value=localDate();$("expenseSave").textContent="＋ 記一筆花費";$("expenseCancel").classList.add("hidden");}
$("expenseCancel").addEventListener("click",resetExpense);
$("expenseForm").addEventListener("submit",e=>{e.preventDefault();const title=$("expenseTitle").value.trim(),amount=Number($("expenseAmount").value),category=$("expenseCategory").value,date=$("expenseDate").value,id=$("expenseEditId").value;if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(date))return toast("請填寫花費項目與日期");if(!Number.isFinite(amount)||amount<=0||amount>MAX_AMOUNT)return toast("金額必須大於 0");if(!twoDecimals(amount))return toast("金額最多只能有 2 位小數");const clean=Math.round(amount*100)/100;if(id){const x=data.expenses.find(e=>e.id===id);if(x)Object.assign(x,{title,amount:clean,category,date});}else data.expenses.push({id:uid(),title,amount:clean,category,date});save();resetExpense();renderExpenses();toast("記帳完成 ✦");});
function renderExpenses(){const today=localDate(),month=today.slice(0,7),total=predicate=>data.expenses.filter(predicate).reduce((s,e)=>s+e.amount,0);$("todayTotal").textContent=money(total(e=>e.date===today));$("monthTotal").textContent=money(total(e=>e.date.startsWith(month)));$("moneyStatus").textContent=`今日花費 ${$("todayTotal").textContent}`;$("expenseCount").textContent=`${data.expenses.length} 筆`;const root=$("expensesList");root.replaceChildren();if(!data.expenses.length){root.append(el("div","empty","🪙 還沒有花費，記下第一筆吧！"));return;}[...data.expenses].sort((a,b)=>b.date.localeCompare(a.date)).forEach(x=>{const box=el("article","record"),head=el("div","record-head"),actions=el("div","record-actions"),edit=el("button",null,"編輯"),del=el("button",null,"刪除");head.append(el("h4",null,x.title),el("time",null,x.date));box.append(head,el("p",null,`${x.category} · ${money(x.amount)}`));edit.type=del.type="button";edit.addEventListener("click",()=>{$("expenseEditId").value=x.id;$("expenseTitle").value=x.title;$("expenseAmount").value=x.amount;$("expenseDate").value=x.date;$("expenseCategory").value=x.category;$("expenseSave").textContent="♡ 儲存修改";$("expenseCancel").classList.remove("hidden");$("expenseForm").scrollIntoView({behavior:"smooth"});});del.addEventListener("click",()=>{if(!confirm(`確定刪除「${x.title}」？`))return;data.expenses=data.expenses.filter(e=>e.id!==x.id);save();renderExpenses();});actions.append(edit,del);box.append(actions);root.append(box);});}

// Backup: only schema-validated JSON replaces browser data (strict 模式檢查金額).
$("exportBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),...data},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`pixel-diary-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("備份已匯出 ♡");});
$("importFile").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>5_000_000)throw Error("檔案過大（上限 5 MB）");let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error("不是有效的 JSON 檔");}const next=normalize(parsed,true);if(!confirm("匯入將取代目前所有資料，確定繼續？"))return;data=next;save();renderAll();syncBgm();toast("備份已匯入！");}catch(err){toast(`匯入失敗：${err.message}`);}finally{e.target.value="";}});

// ---------- Star Catcher：336 x 420 座標系，每局 30 秒療癒模式，可暫停 ----------
const canvas=$("gameCanvas"),ctx=canvas.getContext("2d"),W=336,H=420;
let running=false,paused=false,last=0,elapsed=0,spawn=0,score=0,playerX=168,stars=[],particles=[],leftHeld=false,rightHeld=false,raf=0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const timeLeft=()=>Math.max(0,Math.ceil(GAME_SECONDS-elapsed));
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function drawBackground(t){ctx.fillStyle="#dcd8ff";ctx.fillRect(0,0,W,H);for(let i=0;i<18;i++){const x=(i*73+19)%W,y=(i*47+13)%330;rect(x,y,3,3,i%2?"#fff8ba":"#fff9ff");}for(let i=0;i<5;i++){let x=(i*105+Math.sin(t*.00025+i)*14+W)%W,y=55+i*64;rect(x,y,58,15,"#fff2fc");rect(x+10,y-9,34,9,"#fff2fc");}rect(0,H-42,W,42,"#c3eecf");rect(0,H-42,W,5,"#87d6ac");for(let x=0;x<W;x+=26)rect(x,H-22,12,4,"#a8ddb9");}
function drawPlayer(){const x=Math.round(playerX),y=H-70;rect(x-16,y-15,32,29,"#79587d");rect(x-13,y-12,26,23,"#ffd4e6");rect(x-14,y-23,28,13,"#ee8ab7");rect(x-20,y-16,8,10,"#ee8ab7");rect(x+12,y-16,8,10,"#ee8ab7");rect(x-8,y-5,4,6,"#6f4b76");rect(x+5,y-5,4,6,"#6f4b76");rect(x-12,y+5,6,4,"#f58cba");rect(x+7,y+5,6,4,"#f58cba");rect(x-14,y+14,28,20,"#d594de");rect(x-19,y+33,14,7,"#79587d");rect(x+5,y+33,14,7,"#79587d");rect(x-21,y+15,7,15,"#ffd4e6");rect(x+14,y+15,7,15,"#ffd4e6");}
function drawStar(x,y,r,rainbow){ctx.save();ctx.translate(x,y);ctx.fillStyle=rainbow?"#ff94ba":"#ffca55";ctx.strokeStyle="#7d587b";ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,rr=i%2?r*.48:r;const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);}ctx.closePath();ctx.fill();ctx.stroke();if(rainbow){rect(-3,-3,6,6,"#fff7fa");}ctx.restore();}
function drawGame(t){drawBackground(t);stars.forEach(s=>drawStar(s.x,s.y,s.r,s.rainbow));particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/.5);rect(p.x,p.y,5,5,p.color);});ctx.globalAlpha=1;drawPlayer();}
// 覆蓋層三種狀態：ready（開始前）、paused（暫停中）、end（結束）。
function setOverlay(mode,icon,title,text){$("overlayIcon").textContent=icon;$("gameOverlayTitle").textContent=title;$("gameOverlayText").textContent=text;$("gameStart").classList.toggle("hidden",mode==="paused");$("gameResume").classList.toggle("hidden",mode!=="paused");$("gameQuit").classList.toggle("hidden",mode!=="paused");$("gameOverlay").classList.remove("hidden");}
function finishGame(){if(!running)return;running=false;paused=false;cancelAnimationFrame(raf);leftHeld=rightHeld=false;$("gamePause").classList.add("hidden");const best=score>data.best;if(best){data.best=score;save();}$("bestScore").textContent=data.best;$("gameStart").textContent="↻ 再玩一次";setOverlay("end","⭐","GOOD JOB ♡",`這次得到 ${score} 分！${best?"新的最高分 ✨":"每一顆星星都很棒！"}`);}
function pauseGame(){if(!running||paused)return;paused=true;cancelAnimationFrame(raf);leftHeld=rightHeld=false;$("gamePause").classList.add("hidden");setOverlay("paused","⏸","PAUSED",`休息一下～目前 ${score} 分，還剩 ${timeLeft()} 秒`);}
function resumeGame(){if(!running||!paused)return;paused=false;last=0;$("gameOverlay").classList.add("hidden");$("gamePause").classList.remove("hidden");beep(540);raf=requestAnimationFrame(loop);}
function loop(t){if(!running||paused)return;if(!last)last=t;const dt=Math.min((t-last)/1000,.05);last=t;elapsed+=dt;spawn+=dt;if(leftHeld)playerX-=210*dt;if(rightHeld)playerX+=210*dt;playerX=clamp(playerX,21,W-21);if(spawn>=.65){spawn=0;stars.push({x:18+Math.random()*(W-36),y:-20,r:Math.random()*4+11,vy:75+Math.random()*35,rainbow:Math.random()<.16});}for(const s of stars){s.y+=s.vy*dt;if(Math.abs(s.x-playerX)<28&&s.y>H-86&&s.y<H-40){s.hit=true;score+=s.rainbow?30:10;beep(s.rainbow?880:650);for(let i=0;i<9;i++)particles.push({x:s.x+(Math.random()-.5)*30,y:s.y+(Math.random()-.5)*20,life:.5,color:s.rainbow?"#ef7cba":"#ffce56"});}}stars=stars.filter(s=>!s.hit&&s.y<H+25);for(const p of particles){p.y-=30*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);$("score").textContent=String(score).padStart(3,"0");$("timer").textContent=timeLeft();drawGame(t);if(elapsed>=GAME_SECONDS){finishGame();return;}raf=requestAnimationFrame(loop);}
$("gameStart").addEventListener("click",()=>{running=true;paused=false;last=0;elapsed=0;spawn=0;score=0;stars=[];particles=[];playerX=W/2;$("score").textContent="000";$("timer").textContent=GAME_SECONDS;$("gameOverlay").classList.add("hidden");$("gamePause").classList.remove("hidden");beep(540);raf=requestAnimationFrame(loop);});
$("gamePause").addEventListener("click",()=>{pauseGame();$("gameResume").focus();});
$("gameResume").addEventListener("click",resumeGame);
$("gameQuit").addEventListener("click",finishGame);
function movePointer(e){if(!running||paused)return;const rect=canvas.getBoundingClientRect();playerX=clamp((e.clientX-rect.left)/rect.width*W,21,W-21);}
canvas.addEventListener("pointerdown",e=>{if(running&&!paused){canvas.setPointerCapture(e.pointerId);movePointer(e);}});canvas.addEventListener("pointermove",e=>{if(e.buttons)movePointer(e);});
window.addEventListener("keydown",e=>{if(!running||document.activeElement.matches("input,textarea,select"))return;if(e.key==="p"||e.key==="P"){e.preventDefault();paused?resumeGame():pauseGame();return;}if(e.key==="Escape"){pauseGame();return;}if(paused)return;if(e.key==="ArrowLeft"||e.key==="ArrowRight")e.preventDefault();if(e.key==="ArrowLeft")leftHeld=true;if(e.key==="ArrowRight")rightHeld=true;});window.addEventListener("keyup",e=>{if(e.key==="ArrowLeft")leftHeld=false;if(e.key==="ArrowRight")rightHeld=false;});window.addEventListener("blur",()=>{leftHeld=rightHeld=false;});

function renderAll(){$("todayLabel").textContent=new Date().toLocaleDateString("zh-TW",{month:"long",day:"numeric",weekday:"short"});updateAudioUI();$("bestScore").textContent=data.best;renderTodos();renderGacha();renderNotes();renderExpenses();}
resetNote();resetExpense();renderAll();drawGame(0);
if(loadFailed)toast("舊資料讀取失敗，已另外保留原始資料");
// 離開 App 時：遊戲自動暫停、音樂暫停；回來時更新日期並恢復音樂。
document.addEventListener("visibilitychange",()=>{if(document.hidden){pauseGame();if(audioCtx&&audioCtx.state==="running")audioCtx.suspend().catch(()=>{});return;}$("todayLabel").textContent=new Date().toLocaleDateString("zh-TW",{month:"long",day:"numeric",weekday:"short"});renderGacha();renderExpenses();if(audioCtx&&audioCtx.state==="suspended"&&(data.bgm||data.sound))audioCtx.resume().catch(()=>{});});
