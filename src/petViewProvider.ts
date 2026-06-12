import * as vscode from 'vscode';
import { TimerManager } from './timerManager';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class PetViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'relaxReminder.petView';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _timerManager: TimerManager,
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;

    const mediaPath = vscode.Uri.joinPath(this._context.extensionUri, 'media');
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [mediaPath],
    };
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'ready') {
        this._sendInit();
        // send live timer immediately
        this._sendTimerUpdate();
      }
    }, undefined, this._context.subscriptions);

    // Forward timer ticks into the webview
    this._timerManager.onUpdate(secondsLeft => {
      if (webviewView.visible) {
        this._sendTimerUpdate(secondsLeft);
      }
    });
  }

  /* ── public API ────────────────────────────────────── */

  public sendReminder(text: string): void {
    this._view?.webview.postMessage({ command: 'reminder', text });
  }

  public refreshPets(): void {
    this._sendInit();
  }

  public applyPetSettings(selectedPets: string[], petCount: number, speed: string): void {
    this._view?.webview.postMessage({ command: 'init', selectedPets, petCount, speed });
  }

  public sendCelebrate(): void {
    this._view?.webview.postMessage({ command: 'celebrate' });
  }

  /* ── private ────────────────────────────────────────── */

  private _sendInit(): void {
    const cfg = vscode.workspace.getConfiguration('relaxReminder');
    this._view?.webview.postMessage({
      command: 'init',
      selectedPets: cfg.get<string[]>('selectedPets', ['cat', 'dog', 'rabbit']),
      petCount: cfg.get<number>('petCount', 3),
      speed: cfg.get<string>('petSpeed', 'normal'),
    });
  }

  private _sendTimerUpdate(secondsLeft?: number): void {
    const s = secondsLeft ?? this._timerManager.getSecondsLeft();
    this._view?.webview.postMessage({
      command: 'timerUpdate',
      secondsLeft: s,
      totalSeconds: this._timerManager.getTotalSeconds(),
    });
  }

  /* ══════════════════════════════════════════════════════
     HTML / CSS / JS for the webview
  ══════════════════════════════════════════════════════ */
  private _buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Local resource URIs (lottie player + animation JSON files)
    const mediaUri  = (rel: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', rel)).toString();

    const lottieJs  = mediaUri('lottie_light.min.js');

    // Build a JS map: petType → { walk/idle/sleep/fly: uri }
    const groundPets = ['cat','dog','rabbit','rat','ox','tiger','snake','horse','goat','monkey','rooster','pig'];
    const flyPets    = ['dragon','bird','bee','butterfly','parrot'];
    const animUris: Record<string, Record<string, string>> = {};
    for (const p of groundPets) {
      animUris[p] = {
        walk: mediaUri(`lottie/${p}-walk.json`),
        // idle and sleep are generated shapes — _loadAnim falls back to 'walk'.
      };
    }
    for (const p of flyPets) {
      animUris[p] = {
        fly:  mediaUri(`lottie/${p}-fly.json`),
        // No separate idle for flyers — _loadAnim falls back to 'fly',
        // keeping the high-quality artwork instead of the generated shape.
      };
    }
    const animUrisJson = JSON.stringify(animUris);
    // webview source for local files: vscode-resource: scheme
    const srcAttr = webview.cspSource;

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none';
           style-src 'unsafe-inline';
           script-src 'nonce-${nonce}' ${srcAttr};
           connect-src ${srcAttr};
           img-src ${srcAttr} data:;">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Virtual Pets</title>
<style>
/* ─── reset & base ─────────────────────────── */
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:transparent}
body{
  font-family:'Segoe UI',system-ui,sans-serif;
  background: linear-gradient(180deg,
    rgba(15,15,30,0) 0%,
    rgba(15,15,35,0.6) 70%,
    rgba(10,10,25,0.9) 100%);
  min-height:80px;
}

/* ─── scene ─────────────────────────────────── */
#scene{
  position:relative;
  width:100%;height:100%;
  overflow:hidden;
}

/* ─── top HUD ───────────────────────────────── */
#hud{
  position:absolute;top:6px;right:10px;
  display:flex;align-items:center;gap:8px;
  z-index:10;pointer-events:none;
}
.hud-chip{
  background:rgba(255,255,255,0.08);
  border:1px solid rgba(255,255,255,0.12);
  border-radius:20px;
  padding:3px 10px;
  font-size:11px;
  color:rgba(255,255,255,0.7);
  backdrop-filter:blur(6px);
  white-space:nowrap;
}
.hud-chip.warn{
  border-color:rgba(255,180,0,0.4);
  color:rgba(255,200,80,0.9);
}
.hud-chip.urgent{
  border-color:rgba(255,80,80,0.5);
  color:rgba(255,120,120,0.95);
  animation:pulse-hud 1s ease-in-out infinite;
}
@keyframes pulse-hud{
  0%,100%{box-shadow:0 0 0 0 rgba(255,80,80,0);}
  50%{box-shadow:0 0 8px 2px rgba(255,80,80,0.3);}
}

/* ─── ground ─────────────────────────────────── */
.ground{
  position:absolute;bottom:0;left:0;right:0;
  height:28px;
  background:linear-gradient(0deg,
    rgba(80,120,200,0.18) 0%,
    rgba(80,120,200,0.06) 60%,
    transparent 100%);
  border-top:1px solid rgba(100,150,255,0.15);
}
.ground-shimmer{
  position:absolute;bottom:0;left:-100%;right:-100%;
  height:1px;
  background:linear-gradient(90deg,
    transparent 0%,
    rgba(120,180,255,0.5) 50%,
    transparent 100%);
  animation:shimmer-move 4s linear infinite;
}
@keyframes shimmer-move{
  from{transform:translateX(0)}
  to{transform:translateX(50%)}
}

/* ─── pet ─────────────────────────────────────── */
.pet{
  position:absolute;
  width:72px;height:72px;
  cursor:pointer;
  user-select:none;
  filter:drop-shadow(0 4px 8px rgba(0,0,0,0.35));
  will-change:left,bottom,transform;
}
/* Lottie player container fills the pet div */
.pet-lottie{
  width:100%;height:100%;
  display:block;
  transition:transform 0.15s ease;
}
.pet.flipped .pet-lottie{
  transform:scaleX(-1);
}
/* glow overlays per species */
.pet[data-type="dragon"]{filter:drop-shadow(0 0 10px rgba(255,90,0,0.6)) drop-shadow(0 4px 8px rgba(0,0,0,0.4));}
.pet[data-type="butterfly"]{filter:drop-shadow(0 0 9px rgba(230,100,255,0.55)) drop-shadow(0 4px 8px rgba(0,0,0,0.3));}
.pet[data-type="bee"]{filter:drop-shadow(0 0 8px rgba(255,210,0,0.55)) drop-shadow(0 4px 8px rgba(0,0,0,0.3));}
.pet[data-type="parrot"]{filter:drop-shadow(0 0 8px rgba(60,220,120,0.5)) drop-shadow(0 4px 8px rgba(0,0,0,0.3));}
.pet[data-type="tiger"]{filter:drop-shadow(0 0 9px rgba(255,140,0,0.5)) drop-shadow(0 4px 8px rgba(0,0,0,0.4));}

.pet-shadow{
  position:absolute;
  bottom:-4px;left:50%;
  transform:translateX(-50%);
  width:34px;height:8px;
  background:radial-gradient(ellipse,rgba(0,0,0,0.35) 0%,transparent 70%);
  border-radius:50%;
  transition:width 0.2s,opacity 0.2s;
}

/* ─── speech bubble ─────────────────────────── */
.bubble{
  position:absolute;
  bottom:74px;left:50%;
  transform:translateX(-50%) translateY(4px);
  background:rgba(255,255,255,0.96);
  border-radius:14px;
  padding:5px 11px;
  font-size:11.5px;
  color:#333;
  white-space:nowrap;
  pointer-events:none;
  opacity:0;
  transition:opacity 0.25s ease, transform 0.25s ease;
  backdrop-filter:blur(8px);
  box-shadow:0 4px 18px rgba(0,0,0,0.22);
  z-index:20;
  max-width:180px;
  white-space:normal;
  text-align:center;
  line-height:1.4;
}
.bubble.show{
  opacity:1;
  transform:translateX(-50%) translateY(0);
}
.bubble::after{
  content:'';
  position:absolute;
  bottom:-7px;left:50%;
  transform:translateX(-50%);
  border:5px solid transparent;
  border-top-color:rgba(255,255,255,0.96);
}

/* ─── particles ──────────────────────────────── */
.particle{
  position:absolute;
  border-radius:50%;
  pointer-events:none;
  animation:ptcl 1.1s ease-out forwards;
}
@keyframes ptcl{
  0%  {transform:translate(0,0) scale(1);opacity:1;}
  100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0;}
}

/* ─── reminder banner ────────────────────────── */
#reminder-banner{
  position:absolute;top:0;left:0;right:0;
  background:linear-gradient(135deg,rgba(108,99,255,0.9),rgba(167,139,250,0.9));
  color:#fff;
  font-size:13px;font-weight:600;
  padding:8px 16px;
  text-align:center;
  transform:translateY(-100%);
  transition:transform 0.4s cubic-bezier(.34,1.56,.64,1);
  z-index:30;
  backdrop-filter:blur(8px);
  letter-spacing:0.3px;
  border-bottom:1px solid rgba(255,255,255,0.2);
}
#reminder-banner.show{
  transform:translateY(0);
}
</style>
</head>
<body>
<div id="scene">
  <div id="reminder-banner" id="banner">🔔 Time to take a break!</div>

  <div id="hud">
    <div class="hud-chip" id="timer-chip">⏱ --:--</div>
    <div class="hud-chip" id="pet-chip">🐾 0</div>
  </div>

  <div class="ground">
    <div class="ground-shimmer"></div>
  </div>

  <div id="pets-layer"></div>
</div>

<!-- Lottie player (local, no CDN) -->
<script nonce="${nonce}" src="${lottieJs}"></script>
<script nonce="${nonce}">
/* ═══════════════════════════════════════════════════
   Lottie animation URI map (injected by extension)
═══════════════════════════════════════════════════ */
const ANIM_URIS = ${animUrisJson};

/* ═══════════════════════════════════════════════════
   Pet data
═══════════════════════════════════════════════════ */
const PET_DATA = {
  rat:       {name:'Rat (Zi)',      fly:false},
  ox:        {name:'Ox (Chou)',     fly:false},
  tiger:     {name:'Tiger (Yin)',   fly:false},
  rabbit:    {name:'Rabbit (Mao)',  fly:false},
  dragon:    {name:'Dragon (Chen)', fly:true },
  snake:     {name:'Snake (Si)',    fly:false},
  horse:     {name:'Horse (Wu)',    fly:false},
  goat:      {name:'Goat (Wei)',    fly:false},
  monkey:    {name:'Monkey (Shen)', fly:false},
  rooster:   {name:'Rooster (You)', fly:false},
  dog:       {name:'Dog (Xu)',      fly:false},
  pig:       {name:'Pig (Hai)',     fly:false},
  cat:       {name:'Cat',           fly:false},
  bird:      {name:'Bird',          fly:true },
  bee:       {name:'Bee',           fly:true },
  butterfly: {name:'Butterfly',     fly:true },
  parrot:    {name:'Parrot',        fly:true },
};

const CHAT = [
  '(≧◡≦)','(づ ◕‿◕ )','zzz...','♪ ♫','*nom nom*',
  '(^_^)','~( ˘▾˘~)','(ﾉ◕ヮ◕)ﾉ','🌟','🎵',
];
const IDLE_MSGS = [
  'Are you okay? 💙','Take a break! ☕','(づ ◕‿◕ )づ',
  '*wags tail*','Hey there! 👋','Let’s have fun 🎉','(●´ω｀●)',
];
const PARTICLE_COLORS = [
  '#FF6B9D','#FFD93D','#6BCB77','#4D96FF','#C77DFF','#FF9A3C'
];

/* ═══════════════════════════════════════════════════
   Pet class (Lottie-powered)
═══════════════════════════════════════════════════ */
class Pet {
  constructor(type, layer) {
    this.type  = type;
    this.cfg   = PET_DATA[type];
    this.layer = layer;
    this.fly   = this.cfg.fly;

    /* Outer wrapper */
    this.el = document.createElement('div');
    this.el.className = 'pet';
    this.el.setAttribute('data-type', type);
    this.el.title = this.cfg.name;

    /* Lottie container */
    this.lottieEl = document.createElement('div');
    this.lottieEl.className = 'pet-lottie';

    /* Shadow */
    this.shadowEl = document.createElement('div');
    this.shadowEl.className = 'pet-shadow';

    /* Bubble */
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble';

    this.el.append(this.lottieEl, this.shadowEl, this.bubbleEl);
    this.el.addEventListener('click', () => this._onClick());
    layer.appendChild(this.el);

    /* Physics */
    const W = window.innerWidth  || 300;
    const H = window.innerHeight || 200;
    const spd = window._petSpeed || 1;
    this.x = Math.random() * Math.max(10, W - 76);
    this.y = this.fly ? H * 0.1 + Math.random() * (H * 0.55) : 0;
    this.vx = (0.6 + Math.random() * 1.4) * (Math.random() < 0.5 ? 1 : -1) * spd;
    this.vy = this.fly ? (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1) * spd : 0;
    this.facing = this.vx > 0 ? 'right' : 'left';

    /* State machine */
    this.state   = this.fly ? 'fly' : 'walk';
    this.stateCD = 150 + Math.random() * 250 | 0;
    this.idleCD  = 400 + Math.random() * 600 | 0;
    this._bubTimer = null;
    this._lottieAnim = null;
    this._currentAnimKey = null;

    this._applyPos();
    this._applyFacing();
    this._loadAnim(this.state);
  }

  /* Load (or swap) Lottie animation for given state */
  _loadAnim(state) {
    const uris = ANIM_URIS[this.type];
    if (!uris) return;

    /* Map states to available keys */
    let key = state;
    if (!uris[key]) {
      key = this.fly ? 'fly' : 'walk';   // fallback
    }
    if (key === this._currentAnimKey) return; // already playing
    this._currentAnimKey = key;

    /* Destroy previous */
    if (this._lottieAnim) {
      this._lottieAnim.destroy();
      this._lottieAnim = null;
    }

    if (typeof lottie === 'undefined') return;

    this._lottieAnim = lottie.loadAnimation({
      container: this.lottieEl,
      renderer:  'svg',
      loop:      state !== 'happy',
      autoplay:  true,
      path:      uris[key],
    });

    /* Speed scaling */
    const spd = window._petSpeed || 1;
    this._lottieAnim.setSpeed(spd < 0.7 ? 0.6 : spd > 1.5 ? 1.8 : 1.0);
  }

  _onClick() {
    const msg = CHAT[Math.random() * CHAT.length | 0];
    this._bubble(msg, 2200);
    this._setState('happy');
    this._particles();
    setTimeout(() => this._setState(this.fly ? 'fly' : 'walk'), 1600);
  }

  _bubble(text, ms) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add('show');
    clearTimeout(this._bubTimer);
    this._bubTimer = setTimeout(() => this.bubbleEl.classList.remove('show'), ms);
  }

  _particles() {
    const cx = this.x + 36;
    const cy = this.fly ? this.y + 36 : (window.innerHeight || 200) - 36;
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size  = 5 + Math.random() * 6;
      const angle = Math.random() * Math.PI * 2;
      const dist  = 25 + Math.random() * 35;
      p.style.cssText = [
        \`width:\${size}px\`, \`height:\${size}px\`,
        \`background:\${PARTICLE_COLORS[Math.random()*PARTICLE_COLORS.length|0]}\`,
        \`left:\${cx + Math.random()*16 - 8}px\`,
        \`top:\${cy + Math.random()*16 - 8}px\`,
        \`--dx:\${Math.cos(angle)*dist}px\`,
        \`--dy:\${-Math.abs(Math.sin(angle)*dist)-10}px\`,
        \`animation-delay:\${Math.random()*0.2}s\`,
      ].join(';');
      this.layer.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  }

  _setState(s) {
    if (this.state === s) return;
    this.state = s;
    this._loadAnim(s);
    /* shadow size */
    const big = s === 'idle' || s === 'sleep';
    this.shadowEl.style.width   = big ? '40px' : '28px';
    this.shadowEl.style.opacity = (this.fly && s !== 'idle') ? '0' : (big ? '0.5' : '0.3');
  }

  _applyFacing() {
    if (this.facing === 'left') {
      this.el.classList.add('flipped');
    } else {
      this.el.classList.remove('flipped');
    }
  }

  _applyPos() {
    this.el.style.left = this.x + 'px';
    if (this.fly) {
      this.el.style.top    = Math.max(0, this.y) + 'px';
      this.el.style.bottom = 'auto';
    } else {
      this.el.style.top    = 'auto';
      this.el.style.bottom = '8px';
    }
  }

  update() {
    const W   = window.innerWidth  || 300;
    const H   = window.innerHeight || 200;
    const spd = window._petSpeed   || 1;

    /* state countdown */
    this.stateCD--;
    if (this.stateCD <= 0) {
      const r = Math.random();
      if (this.fly) {
        const next = r < 0.6 ? 'fly' : 'idle';
        if (next !== this.state) this._setState(next);
        if (next === 'fly') {
          this.vx = (0.6 + Math.random()*1.4) * (Math.random()<0.5?1:-1) * spd;
          this.vy = (0.3 + Math.random()*0.7) * (Math.random()<0.5?1:-1) * spd;
        } else {
          this.vx = 0; this.vy = 0;
        }
      } else {
        let next;
        if (r < 0.50)      { next = 'walk'; }
        else if (r < 0.70) { next = 'idle'; }
        else               { next = 'sleep'; }
        if (next !== this.state) this._setState(next);
        this.vx = next === 'walk' ? (0.6 + Math.random()*1.4) * (Math.random()<0.5?1:-1) * spd : 0;
      }
      this.stateCD = 120 + Math.random() * 280 | 0;
    }

    /* idle speech */
    this.idleCD--;
    if (this.idleCD <= 0) {
      this._bubble(IDLE_MSGS[Math.random()*IDLE_MSGS.length|0], 3000);
      this.idleCD = 500 + Math.random() * 700 | 0;
    }

    /* movement */
    const moving = this.state === 'walk' || this.state === 'fly';
    if (moving) {
      this.x += this.vx;
      if (this.fly) this.y += this.vy;

      /* bounce X */
      if (this.x <= 2) {
        this.x = 2; this.vx = Math.abs(this.vx);
        this.facing = 'right'; this._applyFacing();
      } else if (this.x >= W - 78) {
        this.x = W - 78; this.vx = -Math.abs(this.vx);
        this.facing = 'left'; this._applyFacing();
      }

      /* bounce Y for fliers */
      if (this.fly) {
        const minY = 5;
        const maxY = Math.max(20, H - 90);
        if (this.y < minY) { this.y = minY; this.vy =  Math.abs(this.vy); }
        if (this.y > maxY) { this.y = maxY; this.vy = -Math.abs(this.vy); }
      }
    }

    this._applyPos();
  }

  destroy() {
    if (this._lottieAnim) { this._lottieAnim.destroy(); }
    this.el.remove();
  }
}

/* ═══════════════════════════════════════════════════
   Orchestrator
═══════════════════════════════════════════════════ */
const layer     = document.getElementById('pets-layer');
const timerChip = document.getElementById('timer-chip');
const petChip   = document.getElementById('pet-chip');
const banner    = document.getElementById('reminder-banner');
let pets = [];
let rafId = null;

function buildPets(selectedPets, petCount, speed) {
  /* destroy old */
  pets.forEach(p => p.destroy()); pets = [];
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  window._petSpeed = speed === 'slow' ? 0.55 : speed === 'fast' ? 2.2 : 1.0;

  const pool = [...selectedPets].sort(() => Math.random() - 0.5);
  const count = Math.min(petCount, pool.length);
  for (let i = 0; i < count; i++) {
    const type = pool[i];
    if (PET_DATA[type]) pets.push(new Pet(type, layer));
  }

  petChip.textContent = '🐾 ' + pets.length;

  /* Lottie drives its own frame loop; we still need rAF for physics */
  function tick() {
    pets.forEach(p => p.update());
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);
}

/* Auto-start immediately — default pets visible before 'init' arrives */
buildPets(['cat', 'dog', 'rabbit'], 3, 'normal');

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2,'0') + 'm';
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

/* ═══════════════════════════════════════════════════
   VS Code message bus
═══════════════════════════════════════════════════ */
const vscode = acquireVsCodeApi();

window.addEventListener('message', e => {
  const msg = e.data;
  switch(msg.command) {
    case 'init':
      buildPets(msg.selectedPets, msg.petCount, msg.speed);
      break;

    case 'timerUpdate': {
      const s = msg.secondsLeft;
      timerChip.textContent = '⏱ ' + formatTime(s);
      const ratio = s / (msg.totalSeconds || 7200);
      timerChip.className = 'hud-chip' + (ratio < 0.1 ? ' urgent' : ratio < 0.25 ? ' warn' : '');
      break;
    }

    case 'reminder':
      banner.textContent = '🔔 ' + msg.text;
      banner.classList.add('show');
      setTimeout(() => banner.classList.remove('show'), 7000);
      pets.forEach(p => {
        p._bubble('🔔 Time to rest!', 7000);
        p._setState('happy');
        p._particles();
        setTimeout(() => p._setState(p.fly ? 'fly' : 'walk'), 2000);
      });
      break;

    case 'celebrate':
      pets.forEach(p => { p._setState('happy'); p._particles(); });
      setTimeout(() => pets.forEach(p => p._setState(p.fly ? 'fly' : 'walk')), 2000);
      break;
  }
});

vscode.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
  }
}
 