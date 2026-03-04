// ═══════════════════════════════════════════════════════════
//  像素战棋 — 正式版
//  首页 → 加载 → 回合提示 → 布阵(60s) → 自动战斗 → 结算
//  暂停 / 变速 / 战斗日志 / 悬浮提示 / 键盘快捷键
//  总部城堡随 HP 破损 + 受击特效
// ═══════════════════════════════════════════════════════════

/* ═══════ 常量 ═══════ */
const TILE = 32;
const COLS = 14;
const ROWS = 8;
const HQ_COLS = 2;
const FIELD_LEFT  = HQ_COLS;          // 2
const FIELD_RIGHT = COLS - HQ_COLS - 1; // 11
const DEPLOY_COLS = 3;

const PLAYER = 'player';
const ENEMY  = 'enemy';

const HQ_MAX    = 100;
const PREP_TIME = 60;
const DP_MAX    = 20;

const TYPES = {
  infantry: { name:'步兵', letter:'步', cost:1, maxHp:12, atk:3, range:1,
              movCD:0.6, atkCD:0.9, color:'#6cf', shape:'rect' },
  archer:   { name:'弓手', letter:'弓', cost:2, maxHp:8,  atk:3, range:3,
              movCD:0.8, atkCD:1.2, color:'#fd6', shape:'diamond' },
  tank:     { name:'重甲', letter:'甲', cost:3, maxHp:25, atk:4, range:1,
              movCD:1.0, atkCD:1.0, color:'#f77', shape:'heavy' },
};

/* ═══════ DOM ═══════ */
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
canvas.width  = COLS * TILE;
canvas.height = ROWS * TILE;
ctx.imageSmoothingEnabled = false;

function fitCanvas() {
  const logW = 180; // side-log width
  const maxW = window.innerWidth - 20 - logW;
  const maxH = window.innerHeight - 180;
  const r = canvas.width / canvas.height;
  let w = maxW, h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  canvas.style.width  = Math.floor(w) + 'px';
  canvas.style.height = Math.floor(h) + 'px';
  // match log height to canvas
  const logEl = $('battle-log');
  if(logEl) logEl.style.height = Math.floor(h) + 'px';
}
window.addEventListener('resize', fitCanvas);

const $  = id => document.getElementById(id);
const titleScreen  = $('title-screen');
const loadingScreen= $('loading-screen');
const roundBanner  = $('round-banner');
const roundNumText = $('round-number-text');
const pauseOverlay = $('pause-overlay');
const uiRoot       = $('ui-root');

const elPHp    = $('player-hq-hp');
const elEHp    = $('enemy-hq-hp');
const elPBar   = $('player-hq-bar');
const elEBar   = $('enemy-hq-bar');
const elRound  = $('round-display');
const elCount  = $('countdown');
const elDP     = $('deploy-points');
const elPhase  = $('phase-badge');
const elMsg    = $('message');
const elSummary= $('army-summary');
const elLogWrap= $('battle-log');
const elLogBody= $('log-body');
const elTooltip= $('unit-tooltip');

const unitBtns = Array.from(document.querySelectorAll('button[data-unit]'));
const btnStart = $('start-battle');
const btnPause = $('btn-pause');
const btnSpeed = $('btn-speed');
const btnNext  = $('next-round');
const btnAgain = $('btn-play-again');
const btnBack  = $('btn-back-title');
const btnBegin = $('btn-start-game');
const btnResume = $('btn-resume');
const btnQuit   = $('btn-quit');
const confirmOverlay = $('confirm-overlay');
const btnConfirmYes  = $('btn-confirm-yes');
const btnConfirmNo   = $('btn-confirm-no');

/* ═══════ 全局状态 ═══════ */
let gs;            // gameState
let lfTime = 0;    // lastFrameTime
let selUnit = 'infantry';
let particles = [];
let paused = false;
let speed = 1;     // 1, 2, 3
const SPEEDS = [1, 2, 3];
let hoverCol = -1, hoverRow = -1; // 鼠标悬浮格

/* ═══════ 工具 ═══════ */

function mkUnit(side, type, col, row) {
  const d = TYPES[type];
  return { id:(side===PLAYER?'p':'e')+Math.random().toString(36).slice(2),
    side, type, col, row, hp:d.maxHp,
    movT:Math.random()*.3, atkT:Math.random()*.3,
    flash:0, hurt:0 };
}

function spawnProj(fc,fr,tc,tr,c){
  particles.push({k:'proj',x:fc*TILE+TILE/2,y:fr*TILE+TILE/2,
    tx:tc*TILE+TILE/2,ty:tr*TILE+TILE/2,color:c,life:.25,max:.25});
}
function spawnDeath(c,r,col){
  for(let i=0;i<8;i++){const a=Math.PI*2*i/8;
    particles.push({k:'spark',x:c*TILE+TILE/2,y:r*TILE+TILE/2,
      vx:Math.cos(a)*45,vy:Math.sin(a)*45,color:col,life:.5,max:.5});}
}
function spawnHqHit(side){
  const cx=side===PLAYER?TILE:(COLS-1)*TILE, cy=ROWS/2*TILE;
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2,s=20+Math.random()*35;
    particles.push({k:'spark',x:cx+Math.random()*TILE*2-TILE,
      y:cy+Math.random()*TILE*2-TILE,vx:Math.cos(a)*s,vy:Math.sin(a)*s,
      color:side===PLAYER?'#4f4':'#f44',life:.7,max:.7});}
}
function spawnHqExplosion(side){
  const x0=side===PLAYER?0:(COLS-HQ_COLS)*TILE;
  const w=HQ_COLS*TILE, h=ROWS*TILE;
  const cx=x0+w/2, cy=h/2;
  // 大量火焰/碎片粒子
  const colors=['#f80','#fa0','#ff0','#f44','#e60','#fc0','#fff'];
  for(let i=0;i<50;i++){
    const a=Math.random()*Math.PI*2, sp=30+Math.random()*80;
    const c=colors[Math.floor(Math.random()*colors.length)];
    particles.push({k:'spark',x:cx+Math.random()*w*.6-w*.3,
      y:cy+Math.random()*h*.4-h*.2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-20,
      color:c,life:.6+Math.random()*.8,max:1.4});
  }
  // 烟雾粒子（较大、较慢、灰色）
  for(let i=0;i<20;i++){
    const a=Math.random()*Math.PI*2, sp=8+Math.random()*20;
    particles.push({k:'smoke',x:cx+Math.random()*w*.5-w*.25,
      y:cy+Math.random()*h*.3-h*.15,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-12,
      color:'#555',life:1+Math.random()*.6,max:1.6,size:6+Math.random()*6});
  }
}
function tickParticles(dt){
  for(const p of particles){
    p.life-=dt;
    if(p.k==='spark'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=35*dt;}
    else if(p.k==='smoke'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=15*dt;} // 烟雾上浮
  }
  particles=particles.filter(p=>p.life>0);
}

/* ═══════ 战斗日志 ═══════ */
let logEntries = [];
function addLog(html){
  logEntries.push(html);
  if(logEntries.length>60) logEntries.shift();
  elLogBody.innerHTML = logEntries.map(e=>'<div class="log-entry">'+e+'</div>').join('');
  elLogBody.scrollTop = elLogBody.scrollHeight;
}
function clearLog(){ logEntries=[]; elLogBody.innerHTML=''; }

/* ═══════ 状态 ═══════ */

function mkState(pHp,eHp,round){
  return { phase:'prepare', countdown:PREP_TIME,
    pHp:pHp, eHp:eHp, dp:DP_MAX,
    units:[], winner:null, round:round||1,
    pFlash:0, eFlash:0 };
}

function newGame(){
  gs=mkState(HQ_MAX,HQ_MAX,1);
  particles=[]; paused=false; speed=1; clearLog();
  showLoading(()=>showBanner(()=>enterPrep()));
}
function nextRound(){
  const p=gs.pHp,e=gs.eHp,r=gs.round+1;
  gs=mkState(p,e,r); particles=[]; paused=false; speed=1; clearLog();
  showBanner(()=>enterPrep());
}
function enterPrep(){
  uiRoot.classList.remove('hidden');
  roundBanner.classList.add('hidden');
  gs.phase='prepare';
  spawnAI();
  btnStart.classList.remove('hidden');
  btnPause.classList.remove('hidden'); btnPause.innerHTML='<kbd>P</kbd> 暂停';
  btnSpeed.classList.add('hidden');
  btnNext.classList.add('hidden'); btnAgain.classList.add('hidden'); btnBack.classList.add('hidden');
  updateUI(); fitCanvas();
}

function showLoading(cb){
  titleScreen.classList.add('hidden'); loadingScreen.classList.remove('hidden');
  setTimeout(()=>{loadingScreen.classList.add('hidden');cb();},1200);
}
function showBanner(cb){
  uiRoot.classList.add('hidden'); roundBanner.classList.remove('hidden');
  roundNumText.textContent='第 '+gs.round+' 回合';
  setTimeout(()=>{roundBanner.classList.add('hidden');cb();},1800);
}
function backToTitle(){
  uiRoot.classList.add('hidden'); pauseOverlay.classList.add('hidden'); confirmOverlay.classList.add('hidden');
  titleScreen.classList.remove('hidden');
  gs=mkState(HQ_MAX,HQ_MAX,1); gs.phase='title'; particles=[]; paused=false;
}

/* ═══════ AI 布阵 ═══════ */
function spawnAI(){
  const sc=FIELD_RIGHT-DEPLOY_COLS+1, cols=[];
  for(let c=sc;c<=FIELD_RIGHT;c++) cols.push(c);
  let rem=DP_MAX; const eu=[]; let tries=0;
  while(rem>0&&tries<200){tries++;
    const ks=Object.keys(TYPES),k=ks[Math.floor(Math.random()*ks.length)],d=TYPES[k];
    if(d.cost>rem){if(rem<1)break;continue;}
    const c=cols[Math.floor(Math.random()*cols.length)],r=Math.floor(Math.random()*ROWS);
    if(eu.some(u=>u.col===c&&u.row===r))continue;
    eu.push(mkUnit(ENEMY,k,c,r)); rem-=d.cost;}
  gs.units=gs.units.filter(u=>u.side===PLAYER);
  gs.units.push(...eu);
}

/* ═══════ 布阵交互 ═══════ */
function setActive(k){
  selUnit=k;
  unitBtns.forEach(b=>b.classList.toggle('active',b.dataset.unit===k));
}
unitBtns.forEach(b=>b.addEventListener('click',()=>{if(b.dataset.unit)setActive(b.dataset.unit);}));

canvas.addEventListener('click',e=>{
  if(gs.phase!=='prepare')return;
  if(paused)return;  // 暂停时禁止部署
  const rc=canvas.getBoundingClientRect();
  const c=Math.floor(((e.clientX-rc.left)/rc.width)*COLS);
  const r=Math.floor(((e.clientY-rc.top)/rc.height)*ROWS);
  gridClick(c,r);
});

canvas.addEventListener('mousemove',e=>{
  const rc=canvas.getBoundingClientRect();
  hoverCol=Math.floor(((e.clientX-rc.left)/rc.width)*COLS);
  hoverRow=Math.floor(((e.clientY-rc.top)/rc.height)*ROWS);
  updateTooltip(e.clientX, e.clientY);
});
canvas.addEventListener('mouseleave',()=>{hoverCol=hoverRow=-1;elTooltip.classList.add('hidden');});

function gridClick(c,r){
  if(gs.phase!=='prepare')return;
  if(c<FIELD_LEFT||c>=FIELD_LEFT+DEPLOY_COLS||r<0||r>=ROWS)return;
  const ex=gs.units.find(u=>u.col===c&&u.row===r&&u.side===PLAYER);
  if(ex){
    gs.dp=Math.min(gs.dp+TYPES[ex.type].cost,DP_MAX);
    gs.units=gs.units.filter(u=>u!==ex);
  } else {
    const d=TYPES[selUnit]; if(!d||d.cost>gs.dp)return;
    gs.units.push(mkUnit(PLAYER,selUnit,c,r)); gs.dp-=d.cost;
  }
  updateUI();
}

/* ═══════ 悬浮提示 ═══════ */
function updateTooltip(mx,my){
  if(hoverCol<0||hoverRow<0){elTooltip.classList.add('hidden');return;}
  const u=gs.units.find(u=>u.col===hoverCol&&u.row===hoverRow);
  if(!u){elTooltip.classList.add('hidden');return;}
  const d=TYPES[u.type]; if(!d){elTooltip.classList.add('hidden');return;}
  const sideLabel = u.side===PLAYER?'<span style="color:#6f6">我方</span>':'<span style="color:#f66">敌方</span>';
  elTooltip.innerHTML=
    '<div class="tt-name">'+sideLabel+' '+d.name+'</div>'+
    '<div class="tt-stat">❤ HP <b>'+u.hp+'/'+d.maxHp+'</b></div>'+
    '<div class="tt-stat">⚔ 攻击 <b>'+d.atk+'</b></div>'+
    '<div class="tt-stat">🎯 射程 <b>'+d.range+'</b></div>'+
    '<div class="tt-stat">🏃 移速 <b>'+d.movCD+'s</b></div>'+
    '<div class="tt-stat">⏱ 攻速 <b>'+d.atkCD+'s</b></div>';
  elTooltip.classList.remove('hidden');
  // 定位
  const ga=document.querySelector('.game-area').getBoundingClientRect();
  let tx=mx-ga.left+12, ty=my-ga.top-80;
  if(tx+140>ga.width) tx=mx-ga.left-140;
  if(ty<0) ty=my-ga.top+16;
  elTooltip.style.left=tx+'px'; elTooltip.style.top=ty+'px';
}

/* ═══════ 按钮事件 ═══════ */
btnBegin.addEventListener('click',()=>newGame());

btnStart.addEventListener('click',()=>{
  if(gs.phase!=='prepare')return;
  gs.countdown=0; startBattle();
});

btnPause.addEventListener('click',()=>togglePause());
btnResume.addEventListener('click',()=>{ if(paused) togglePause(); });
btnSpeed.addEventListener('click',()=>cycleSpeed());

btnNext.addEventListener('click',()=>{if(gs.phase==='result')nextRound();});
btnAgain.addEventListener('click',()=>{if(gs.phase==='gameover')newGame();});
btnBack.addEventListener('click',()=>{if(gs.phase==='gameover')backToTitle();});

/* 退出确认流程 */
btnQuit.addEventListener('click',()=>{
  // 显示确认弹窗
  confirmOverlay.classList.remove('hidden');
});
btnConfirmYes.addEventListener('click',()=>{
  confirmOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  paused=false;
  backToTitle();
});
btnConfirmNo.addEventListener('click',()=>{
  confirmOverlay.classList.add('hidden');
});

function togglePause(){
  if(gs.phase!=='battle'&&gs.phase!=='prepare')return;
  paused=!paused;
  pauseOverlay.classList.toggle('hidden',!paused);
  btnPause.innerHTML=(paused?'<kbd>P</kbd> 继续':'<kbd>P</kbd> 暂停');
}
function cycleSpeed(){
  const i=(SPEEDS.indexOf(speed)+1)%SPEEDS.length;
  speed=SPEEDS[i];
  btnSpeed.textContent=speed+'×';
}

function startBattle(){
  if(gs.phase!=='prepare')return;
  gs.phase='battle'; paused=false; speed=1;
  btnStart.classList.add('hidden');
  btnPause.classList.remove('hidden'); btnSpeed.classList.remove('hidden');
  btnSpeed.textContent='1×';
  btnPause.innerHTML='<kbd>P</kbd> 暂停';
  btnNext.classList.add('hidden'); btnAgain.classList.add('hidden'); btnBack.classList.add('hidden');
  elMsg.textContent='⚔️ 战斗进行中...';
  addLog('<span class="log-move">— 战斗开始 —</span>');
}

/* ═══════ 键盘快捷键 ═══════ */
document.addEventListener('keydown',e=>{
  if(!gs)return;
  const key=e.key.toLowerCase();
  if(gs.phase==='prepare'){
    if(key==='1'&&!paused) setActive('infantry');
    else if(key==='2'&&!paused) setActive('archer');
    else if(key==='3'&&!paused) setActive('tank');
    else if((key===' '||key==='enter')&&!paused){e.preventDefault(); btnStart.click();}
    else if(key==='p') togglePause();
  }
  if(gs.phase==='battle' && key==='p') togglePause();
  if(gs.phase==='battle' && (key==='+'||key==='=')) cycleSpeed();
  if(gs.phase==='result' && (key===' '||key==='enter')){e.preventDefault();btnNext.click();}
});

/* ═══════ UI 更新 ═══════ */
function updateUI(){
  if(!gs)return;
  const pDisp=Math.max(0,gs.pHp), eDisp=Math.max(0,gs.eHp);
  elPHp.textContent=pDisp; elEHp.textContent=eDisp;
  elPBar.style.width=(pDisp/HQ_MAX*100)+'%';
  elEBar.style.width=(eDisp/HQ_MAX*100)+'%';
  elRound.textContent=gs.round;
  elCount.textContent=Math.max(0,Math.ceil(gs.countdown));
  elDP.textContent=gs.dp;

  // 阶段标志
  if(gs.phase==='prepare'){
    elPhase.textContent='准备阶段'; elPhase.className='phase-badge';
  } else if(gs.phase==='battle'){
    elPhase.textContent='战斗中'; elPhase.className='phase-badge battle';
  } else {
    elPhase.textContent='结算'; elPhase.className='phase-badge result';
  }

  // 军队摘要
  const pUnits=gs.units.filter(u=>u.side===PLAYER);
  const eUnits=gs.units.filter(u=>u.side===ENEMY);
  const count=(arr,t)=>arr.filter(u=>u.type===t).length;
  let summary='我方: ';
  for(const t of Object.keys(TYPES)){const n=count(pUnits,t);if(n)summary+=TYPES[t].name+'×'+n+' ';}
  summary+='  敌方: ';
  for(const t of Object.keys(TYPES)){const n=count(eUnits,t);if(n)summary+=TYPES[t].name+'×'+n+' ';}
  elSummary.textContent=summary;

  // 显隐倒计时/点数
  const isPrep = gs.phase==='prepare';
  $('countdown-wrap').style.opacity = isPrep?'1':'0.3';
  $('points-wrap').style.opacity    = isPrep?'1':'0.3';
}

/* ═══════ 主循环 ═══════ */
function loop(ts){
  const raw=(ts-lfTime)/1000; lfTime=ts;
  if(!Number.isFinite(raw)||raw>.5){requestAnimationFrame(loop);return;}
  if(gs){
    const dt = paused ? 0 : raw * speed;
    update(dt, raw);
    render();
  }
  requestAnimationFrame(loop);
}

function update(dt, rawDt){
  if(gs.phase==='prepare'){
    gs.countdown-=dt;
    if(gs.countdown<=0){gs.countdown=0;startBattle();}
  } else if(gs.phase==='battle'&&!paused){
    updateBattle(dt);
  }
  if(gs.pFlash>0) gs.pFlash-=rawDt;
  if(gs.eFlash>0) gs.eFlash-=rawDt;
  tickParticles(rawDt); // 粒子始终更新（即使暂停也播完）
  updateUI();
}

/* ═══════ 战斗逻辑 ═══════ */
function updateBattle(dt){
  const us=gs.units;
  for(const u of us){if(u.flash>0)u.flash-=dt;if(u.hurt>0)u.hurt-=dt;}

  if(!us.some(u=>u.side===PLAYER&&u.hp>0)){endBattle(ENEMY);return;}
  if(!us.some(u=>u.side===ENEMY &&u.hp>0)){endBattle(PLAYER);return;}

  for(const u of us){
    if(u.hp<=0)continue;
    const d=TYPES[u.type]; if(!d)continue;
    u.movT+=dt; u.atkT+=dt;

    let best=null,bDist=Infinity;
    for(const e of us){if(e.side===u.side||e.hp<=0)continue;
      const dist=Math.abs(e.col-u.col)+Math.abs(e.row-u.row);
      if(dist<bDist){bDist=dist;best=e;}}
    if(!best)continue;

    if(bDist<=d.range){
      if(u.atkT>=d.atkCD){
        u.atkT=0; best.hp-=d.atk;
        u.flash=.15; best.hurt=.2;
        if(d.range>1) spawnProj(u.col,u.row,best.col,best.row,d.color);

        const bd=TYPES[best.type];
        const sideTag=u.side===PLAYER?'我':'敌';
        addLog('<span class="log-atk">'+sideTag+'方'+d.name+' → '+bd.name+' -'+d.atk+' ('+Math.max(0,best.hp)+'/'+bd.maxHp+')</span>');

        if(best.hp<=0){
          spawnDeath(best.col,best.row,bd?.color||'#fff');
          addLog('<span class="log-kill">💀 '+(best.side===PLAYER?'我':'敌')+'方'+bd.name+' 被击破！</span>');
        }
      }
    } else {
      if(u.movT>=d.movCD){
        u.movT=0;
        const dx=best.col-u.col,dy=best.row-u.row;
        let moves;
        if(Math.abs(dx)>=Math.abs(dy)){
          moves=[{c:u.col+(dx>0?1:-1),r:u.row},{c:u.col,r:u.row+(dy>0?1:dy<0?-1:0)}];
        }else{
          moves=[{c:u.col,r:u.row+(dy>0?1:-1)},{c:u.col+(dx>0?1:dx<0?-1:0),r:u.row}];
        }
        for(const m of moves){
          const nc=Math.max(FIELD_LEFT,Math.min(FIELD_RIGHT,m.c));
          const nr=Math.max(0,Math.min(ROWS-1,m.r));
          if(nc===u.col&&nr===u.row)continue;
          if(us.some(o=>o!==u&&o.hp>0&&o.col===nc&&o.row===nr))continue;
          u.col=nc;u.row=nr;break;
        }
      }
    }
  }
  gs.units=us.filter(u=>u.hp>0);
}

/* ═══════ 回合结算 ═══════ */
function endBattle(winner){
  gs.phase='result'; gs.winner=winner;
  const rem=gs.units.filter(u=>u.side===winner);
  const totalMax=rem.reduce((s,u)=>s+(TYPES[u.type]?.maxHp||0),0);
  const dmg=Math.round(totalMax*.5);

  if(winner===PLAYER){gs.eHp-=dmg;gs.eFlash=.8;spawnHqHit(ENEMY);}
  else               {gs.pHp-=dmg;gs.pFlash=.8;spawnHqHit(PLAYER);}
  // clamp to 0
  gs.pHp=Math.max(0,gs.pHp); gs.eHp=Math.max(0,gs.eHp);
  // 总部被摧毁 → 爆炸特效
  if(gs.pHp<=0) spawnHqExplosion(PLAYER);
  if(gs.eHp<=0) spawnHqExplosion(ENEMY);

  const ed=winner===PLAYER?dmg:0, pd=winner===ENEMY?dmg:0;
  let txt=winner===PLAYER?'🎉 本回合胜利！':'💀 本回合失败...';
  txt+=' 敌方总部 -'+ed+'  我方总部 -'+pd;

  addLog('<span class="log-kill">— 战斗结束 — '+(winner===PLAYER?'胜利':'失败')+'</span>');
  addLog('总部伤害：敌方 -'+ed+'  我方 -'+pd);

  const over=gs.pHp<=0||gs.eHp<=0;
  if(over){
    if(gs.pHp<=0&&gs.eHp<=0) txt+='  ⚖️ 平局！';
    else if(gs.eHp<=0)       txt+='  🏆 你赢了！';
    else                      txt+='  💔 游戏结束';
    gs.phase='gameover';
  }

  elMsg.textContent=txt;
  btnStart.classList.add('hidden'); btnPause.classList.add('hidden'); btnSpeed.classList.add('hidden');
  pauseOverlay.classList.add('hidden');

  if(!over){
    btnNext.classList.remove('hidden');
  } else {
    setTimeout(()=>{btnAgain.classList.remove('hidden');btnBack.classList.remove('hidden');},1200);
  }
}

/* ╔══════════════════════════════════╗
   ║           渲    染              ║
   ╚══════════════════════════════════╝ */

function render(){
  const W=canvas.width,H=canvas.height;
  ctx.fillStyle='#08080e'; ctx.fillRect(0,0,W,H);
  drawHQ(PLAYER); drawHQ(ENEMY);
  drawGrid(); drawUnits(); drawParticles();
  if(paused) drawPauseVeil();
}

/* --- 网格 --- */
function drawGrid(){
  const isPrep=gs.phase==='prepare';
  for(let r=0;r<ROWS;r++){
    for(let c=FIELD_LEFT;c<=FIELD_RIGHT;c++){
      const x=c*TILE,y=r*TILE;
      const pZone=c<FIELD_LEFT+DEPLOY_COLS;
      const eZone=c>FIELD_RIGHT-DEPLOY_COLS;

      // 基础色
      ctx.fillStyle=pZone?'#0d1818':eZone?'#180d0d':'#101014';
      ctx.fillRect(x,y,TILE,TILE);

      // 准备阶段：己方区域脉冲高亮
      if(isPrep && pZone){
        const pulse=Math.sin(Date.now()/400)*0.06+0.06;
        ctx.fillStyle='rgba(60,180,120,'+pulse.toFixed(3)+')';
        ctx.fillRect(x,y,TILE,TILE);
      }

      // 鼠标悬浮高亮
      if(c===hoverCol&&r===hoverRow){
        ctx.fillStyle='rgba(255,255,255,0.08)';
        ctx.fillRect(x,y,TILE,TILE);
        ctx.strokeStyle='#666'; ctx.lineWidth=1.5;
        ctx.strokeRect(x+1,y+1,TILE-2,TILE-2);
        ctx.lineWidth=1;
      }

      // 网格线
      ctx.strokeStyle='#1e1e24';
      ctx.strokeRect(x+.5,y+.5,TILE-1,TILE-1);
    }
  }

  // 区域标签
  ctx.font='bold 10px sans-serif'; ctx.textAlign='center';
  ctx.fillStyle='rgba(100,200,140,0.35)';
  ctx.fillText('我方区域',(FIELD_LEFT+DEPLOY_COLS/2)*TILE, 10);
  ctx.fillStyle='rgba(200,100,100,0.35)';
  ctx.fillText('敌方区域',(FIELD_RIGHT-DEPLOY_COLS/2+.5)*TILE, 10);
}

/* --- 总部城堡 --- */
function drawHQ(side){
  const rawHp=side===PLAYER?gs.pHp:gs.eHp;
  const hp=Math.max(0,rawHp);
  const fl=side===PLAYER?gs.pFlash:gs.eFlash;
  const ratio=hp/HQ_MAX;
  const x0=side===PLAYER?0:(COLS-HQ_COLS)*TILE;
  const w=HQ_COLS*TILE, h=ROWS*TILE;
  const cx=x0+w/2,cy=h/2,bw=w*.72,bh=h*.54;

  // 背景
  ctx.fillStyle=side===PLAYER?'#0a160a':'#160a0a';
  ctx.fillRect(x0,0,w,h);
  // 受击闪
  if(fl>0){ctx.fillStyle='rgba(255,60,60,'+(fl*.7).toFixed(2)+')';ctx.fillRect(x0,0,w,h);}

  if(hp<=0){
    // ═══ 废墟状态 ═══
    drawRuins(cx,cy,bw,bh,x0,w,h,side);
  } else {
    // ═══ 正常城堡 ═══
    // 墙色
    const wc=ratio>.6?(side===PLAYER?'#3a7a3a':'#7a3a3a')
             :ratio>.3?(side===PLAYER?'#5a6a30':'#6a5a30'):'#4a4a4a';
    ctx.fillStyle=wc;
    ctx.fillRect(cx-bw/2,cy-bh/2+12,bw,bh-12);

    // 城垛
    const mw=bw/5,mh=14;
    for(let i=0;i<3;i++){
      if(ratio<.3&&i===1)continue;
      if(ratio<.15&&i===2)continue;
      ctx.fillRect(cx-bw/2+(i*2+.5)*mw,cy-bh/2+12-mh,mw,mh);
    }

    // 城门
    ctx.fillStyle=ratio>.3?'#2a1a0a':'#1a1a1a';
    const gw=bw*.32,gh=bh*.36;
    ctx.fillRect(cx-gw/2,cy+bh/2-gh,gw,gh);

    // 窗户
    if(ratio>.4){
      ctx.fillStyle='#1a1a1a';
      ctx.fillRect(cx-bw/3.5,cy-bh/6,6,8);
      ctx.fillRect(cx+bw/3.5-6,cy-bh/6,6,8);
    }

    // 裂痕
    if(ratio<.7){
      ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2;
      const n=ratio<.2?6:ratio<.4?4:ratio<.55?2:1;
      for(let i=0;i<n;i++){
        const sx=cx-bw/3+(i*17)%(bw*.6), sy=cy-bh/4+(i*23)%(bh*.4);
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+7+i*3,sy+10+i*4);ctx.lineTo(sx+2+i*2,sy+18+i*3);ctx.stroke();
      }
      ctx.lineWidth=1;
    }
    // 碎石
    if(ratio<.35){
      ctx.fillStyle='#444';
      for(let i=0;i<5;i++) ctx.fillRect(cx-bw/3+i*11,cy+bh/2+2+i%3*3,5+i%2*3,3+i%2*2);
    }
    // 旗帜
    const fx=cx,fy=cy-bh/2-4;
    ctx.strokeStyle='#777';ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-22);ctx.stroke();
    ctx.fillStyle=side===PLAYER?'#4a4':'#a44';
    const wave=Math.sin(Date.now()/300)*2;
    ctx.beginPath();ctx.moveTo(fx+1,fy-22);ctx.lineTo(fx+12,fy-18+wave);ctx.lineTo(fx+1,fy-14);ctx.closePath();ctx.fill();
  }

  // HP 文字+条
  ctx.fillStyle=hp<=0?'#f44':'#ccc';ctx.font='bold 13px monospace';ctx.textAlign='center';
  ctx.fillText(hp+'/'+HQ_MAX,cx,cy+bh/2+18);
  const bwBar=bw*.8,bhBar=4,bxBar=cx-bwBar/2,byBar=cy+bh/2+22;
  ctx.fillStyle='#222';ctx.fillRect(bxBar,byBar,bwBar,bhBar);
  if(hp>0){
    ctx.fillStyle=ratio>.5?'#0d0':ratio>.25?'#ff0':'#f00';
    ctx.fillRect(bxBar,byBar,bwBar*ratio,bhBar);
  }
}

/* --- 废墟 --- */
function drawRuins(cx,cy,bw,bh,x0,w,h,side){
  // 烟雾背景氛围
  const smokeAlpha=(Math.sin(Date.now()/800)*.08+.12).toFixed(3);
  ctx.fillStyle='rgba(60,30,10,'+smokeAlpha+')';
  ctx.fillRect(x0,0,w,h);

  // 残垣（矮墙碎块）
  ctx.fillStyle='#3a3a3a';
  // 左侧断墙
  ctx.fillRect(cx-bw/2,cy+bh*.12,bw*.25,bh*.28);
  // 右侧断墙
  ctx.fillRect(cx+bw*.15,cy+bh*.06,bw*.28,bh*.22);
  // 中间碎块
  ctx.fillStyle='#2e2e2e';
  ctx.fillRect(cx-bw*.08,cy+bh*.2,bw*.2,bh*.16);

  // 散落碎石
  ctx.fillStyle='#444';
  const seed=side===PLAYER?7:13;
  for(let i=0;i<12;i++){
    const sx=cx-bw/2.5+((i*seed*17+3)%(bw*1.1));
    const sy=cy+bh*.1+((i*seed*11+7)%(bh*.45));
    const sw=3+i%4*2, sh=2+i%3*2;
    ctx.fillRect(sx,sy,sw,sh);
  }

  // 焦痕地面
  ctx.fillStyle='#1a1008';
  ctx.fillRect(cx-bw*.4,cy+bh*.35,bw*.8,bh*.08);

  // 持续冒烟效果（动态小烟柱）
  ctx.globalAlpha=0.35;
  const t=Date.now()/1000;
  for(let i=0;i<3;i++){
    const sx=cx-bw*.25+i*bw*.25;
    const drift=Math.sin(t*1.2+i*2)*4;
    const smokeH=12+Math.sin(t*.8+i)*6;
    ctx.fillStyle='#555';
    ctx.beginPath();
    ctx.arc(sx+drift,cy-bh*.05-smokeH-i*8,5+i*1.5,0,Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx+drift*.7,cy-bh*.05-smokeH*1.5-i*6,3+i,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha=1;

  // 倒下的旗杆
  ctx.strokeStyle='#555';ctx.lineWidth=2;
  const fx=cx-bw*.15,fy=cy+bh*.15;
  ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx+18,fy-6);ctx.stroke();
  ctx.lineWidth=1;

  // DESTROYED 标签
  ctx.fillStyle='#f44';ctx.font='bold 10px monospace';ctx.textAlign='center';
  ctx.fillText('DESTROYED',cx,cy+bh/2+6);
}

/* --- 单位 --- */
function drawUnits(){
  for(const u of gs.units){
    const d=TYPES[u.type]; if(!d)continue;
    const x=u.col*TILE,y=u.row*TILE,pad=3,w=TILE-pad*2,h=TILE-pad*2;

    let fill=d.color;
    if(u.flash>0) fill='#fff';
    else if(u.hurt>0) fill='#f44';

    ctx.fillStyle=fill;
    if(d.shape==='diamond'){
      ctx.beginPath();
      ctx.moveTo(x+TILE/2,y+pad); ctx.lineTo(x+TILE-pad,y+TILE/2);
      ctx.lineTo(x+TILE/2,y+TILE-pad); ctx.lineTo(x+pad,y+TILE/2);
      ctx.closePath();ctx.fill();
    } else if(d.shape==='heavy'){
      ctx.fillRect(x+2,y+2,TILE-4,TILE-4);
      ctx.fillStyle=u.flash>0?'#ccc':'#a33';
      ctx.fillRect(x+7,y+7,TILE-14,TILE-14);
    } else {
      ctx.fillRect(x+pad,y+pad,w,h);
    }

    // 阵营边框
    ctx.strokeStyle=u.side===PLAYER?'#0f0':'#f00';
    ctx.strokeRect(x+pad,y+pad,w,h);

    // 类型文字
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(d.letter,x+TILE/2+1,y+TILE/2-1);
    ctx.fillStyle='#fff';
    ctx.fillText(d.letter,x+TILE/2,y+TILE/2-2);
    ctx.textBaseline='alphabetic';

    // 血条
    const hpR=Math.max(0,u.hp)/d.maxHp;
    ctx.fillStyle='#1a1a1a';ctx.fillRect(x+pad,y+TILE-6,w,3);
    ctx.fillStyle=hpR>.5?'#0d0':hpR>.25?'#ff0':'#f00';
    ctx.fillRect(x+pad,y+TILE-6,w*hpR,3);
  }
}

/* --- 粒子 --- */
function drawParticles(){
  for(const p of particles){
    const a=Math.max(0,p.life/p.max);ctx.globalAlpha=a;
    if(p.k==='proj'){
      const t=1-p.life/p.max;
      ctx.fillStyle=p.color;ctx.fillRect(p.x+(p.tx-p.x)*t-2,p.y+(p.ty-p.y)*t-2,5,5);
    } else if(p.k==='spark'){
      ctx.fillStyle=p.color;ctx.fillRect(p.x-2,p.y-2,4,4);
    } else if(p.k==='smoke'){
      const sz=p.size||6;
      ctx.fillStyle=p.color;
      ctx.beginPath();ctx.arc(p.x,p.y,sz*a,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
}

/* --- 暂停面纱 --- */
function drawPauseVeil(){
  ctx.fillStyle='rgba(0,0,0,0.45)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ffd966';ctx.font='bold 24px sans-serif';ctx.textAlign='center';
  ctx.fillText('⏸ 已暂停',canvas.width/2,canvas.height/2);
}

/* ═══════ 启动 ═══════ */
gs=mkState(HQ_MAX,HQ_MAX,1);
gs.phase='title';
setActive('infantry');
fitCanvas();
requestAnimationFrame(loop);
