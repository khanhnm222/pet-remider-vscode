import * as vscode from 'vscode';
import { TimerManager } from './timerManager';
import { PetViewProvider } from './petViewProvider';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export class SettingsPanel {
  private static _current?: SettingsPanel;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    private readonly _timerManager: TimerManager,
    private readonly _petView: PetViewProvider,
  ) {
    this._panel = panel;
    this._panel.webview.html = this._buildHtml();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(msg => {
      switch (msg.command) {
        case 'ready':
          this._sendCurrentSettings();
          this._sendTimerState();
          break;
        case 'saveSettings':
          this._applySettings(msg.settings);
          break;
        case 'resetTimer':
          this._timerManager.resetTimer();
          this._sendTimerState();
          break;
        case 'snooze':
          this._timerManager.snooze(msg.minutes ?? 15);
          this._sendTimerState();
          break;
      }
    }, null, this._disposables);

    // Live timer updates
    this._timerManager.onUpdate(s => {
      if (this._panel.visible) {
        this._panel.webview.postMessage({
          command: 'timerTick',
          secondsLeft: s,
          totalSeconds: this._timerManager.getTotalSeconds(),
        });
      }
    });
  }

  public static createOrShow(
    context: vscode.ExtensionContext,
    timerManager: TimerManager,
    petView: PetViewProvider,
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel._current) {
      SettingsPanel._current._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'relaxReminderSettings',
      '🐾 Relax Reminder — Settings',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    SettingsPanel._current = new SettingsPanel(panel, context, timerManager, petView);
  }

  private _sendCurrentSettings(): void {
    const cfg = vscode.workspace.getConfiguration('relaxReminder');
    this._panel.webview.postMessage({
      command: 'loadSettings',
      settings: {
        reminderInterval: cfg.get<number>('reminderIntervalMinutes', 120),
        selectedPets: cfg.get<string[]>('selectedPets', ['cat', 'dog', 'rabbit']),
        petCount: cfg.get<number>('petCount', 3),
        speed: cfg.get<string>('petSpeed', 'normal'),
        autoShowOnStartup: cfg.get<boolean>('autoShowOnStartup', true),
      },
    });
  }

  private _sendTimerState(): void {
    this._panel.webview.postMessage({
      command: 'timerTick',
      secondsLeft: this._timerManager.getSecondsLeft(),
      totalSeconds: this._timerManager.getTotalSeconds(),
    });
  }

  private async _applySettings(settings: {
    reminderInterval: number;
    selectedPets: string[];
    petCount: number;
    speed: string;
    autoShowOnStartup: boolean;
  }): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('relaxReminder');
    await Promise.all([
      cfg.update('reminderIntervalMinutes', settings.reminderInterval, vscode.ConfigurationTarget.Global),
      cfg.update('selectedPets', settings.selectedPets, vscode.ConfigurationTarget.Global),
      cfg.update('petCount', settings.petCount, vscode.ConfigurationTarget.Global),
      cfg.update('petSpeed', settings.speed, vscode.ConfigurationTarget.Global),
      cfg.update('autoShowOnStartup', settings.autoShowOnStartup, vscode.ConfigurationTarget.Global),
    ]);
    this._timerManager.resetTimer();
    this._petView.applyPetSettings(settings.selectedPets, settings.petCount, settings.speed);
    this._petView.sendCelebrate();
    vscode.window.showInformationMessage('🐾 Relax Reminder: Settings saved!');
  }

  public dispose(): void {
    SettingsPanel._current = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  /* ══════════════════════════════════════════════════════
     Settings panel HTML
  ══════════════════════════════════════════════════════ */
  private _buildHtml(): string {
    const nonce = getNonce();
    return /* html */`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Relax Reminder Settings</title>
<style>
/* ─── base ───────────────────────────────────────── */
:root{
  --bg:#12121e;
  --card:rgba(255,255,255,0.045);
  --border:rgba(255,255,255,0.09);
  --accent:#7c6fef;
  --accent2:#b39cf7;
  --text:#e2e8f0;
  --muted:#8a96a8;
  --radius:16px;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{
  background:var(--bg);
  color:var(--text);
  font-family:'Segoe UI',system-ui,sans-serif;
  font-size:14px;
  min-height:100vh;
  padding:20px 24px 40px;
  scrollbar-width:thin;
  scrollbar-color:rgba(255,255,255,0.1) transparent;
}

/* ─── header ─────────────────────────────────────── */
.page-header{
  display:flex;align-items:center;gap:14px;
  margin-bottom:22px;
}
.logo{font-size:38px;line-height:1;filter:drop-shadow(0 0 12px rgba(124,111,239,0.5));}
.header-text h1{
  font-size:20px;font-weight:700;
  background:linear-gradient(135deg,#7c6fef,#b39cf7);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
  background-clip:text;
}
.header-text p{color:var(--muted);font-size:12px;margin-top:2px;}

/* ─── timer status bar ───────────────────────────── */
.timer-bar{
  display:flex;align-items:center;justify-content:space-between;
  background:rgba(124,111,239,0.1);
  border:1px solid rgba(124,111,239,0.22);
  border-radius:14px;padding:12px 18px;
  margin-bottom:18px;
}
.timer-bar .label{color:var(--muted);font-size:12px;}
.timer-val{
  font-size:22px;font-weight:700;
  color:var(--accent2);
  font-variant-numeric:tabular-nums;
  min-width:68px;text-align:right;
}
.timer-btns{display:flex;gap:8px;}
.timer-btns button{
  padding:5px 13px;border-radius:20px;
  border:1px solid var(--border);
  background:rgba(255,255,255,0.04);
  color:var(--text);font-size:12px;cursor:pointer;
  transition:all 0.18s;
}
.timer-btns button:hover{
  background:rgba(124,111,239,0.2);
  border-color:var(--accent);
}
.progress-track{
  height:4px;background:rgba(255,255,255,0.07);
  border-radius:2px;margin-top:10px;overflow:hidden;
}
.progress-fill{
  height:100%;background:linear-gradient(90deg,#7c6fef,#b39cf7);
  border-radius:2px;
  transition:width 1s linear;
}

/* ─── card ───────────────────────────────────────── */
.card{
  background:var(--card);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:18px 20px;
  margin-bottom:14px;
  animation:fadeUp 0.3s ease backwards;
}
.card:nth-child(1){animation-delay:0.04s}
.card:nth-child(2){animation-delay:0.08s}
.card:nth-child(3){animation-delay:0.12s}
.card:nth-child(4){animation-delay:0.16s}
.card:nth-child(5){animation-delay:0.20s}
@keyframes fadeUp{
  from{opacity:0;transform:translateY(8px)}
  to  {opacity:1;transform:translateY(0)}
}
.section-label{
  font-size:11px;font-weight:600;
  color:var(--muted);
  text-transform:uppercase;letter-spacing:.06em;
  margin-bottom:14px;
}

/* ─── range slider ───────────────────────────────── */
.slider-row{display:flex;align-items:center;gap:16px;}
.slider-val{
  font-size:28px;font-weight:700;
  color:var(--accent2);
  min-width:88px;text-align:center;
  font-variant-numeric:tabular-nums;
}
input[type=range]{
  flex:1;-webkit-appearance:none;
  height:6px;border-radius:3px;
  background:rgba(255,255,255,0.1);outline:none;cursor:pointer;
}
input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;
  width:20px;height:20px;border-radius:50%;
  background:linear-gradient(135deg,#7c6fef,#b39cf7);
  cursor:pointer;
  box-shadow:0 0 10px rgba(124,111,239,0.55);
  transition:transform 0.15s;
}
input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.18);}
.slider-hint{color:var(--muted);font-size:12px;text-align:center;margin-top:8px;}

/* ─── pet count ──────────────────────────────────── */
.count-row{display:flex;align-items:center;gap:14px;}
.cnt-btn{
  width:34px;height:34px;border-radius:50%;
  border:1px solid var(--border);
  background:rgba(255,255,255,0.04);
  color:var(--text);font-size:20px;
  cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all 0.18s;user-select:none;
}
.cnt-btn:hover{background:rgba(124,111,239,0.25);border-color:var(--accent);}
.cnt-val{font-size:26px;font-weight:700;min-width:36px;text-align:center;color:var(--accent2);}

/* ─── speed ──────────────────────────────────────── */
.speed-row{display:flex;gap:10px;flex-wrap:wrap;}
.speed-btn{
  flex:1;padding:9px 12px;border-radius:22px;
  border:1px solid var(--border);
  background:rgba(255,255,255,0.03);
  color:var(--muted);font-size:13px;cursor:pointer;
  transition:all 0.2s;text-align:center;
}
.speed-btn.active{
  background:rgba(124,111,239,0.22);
  border-color:var(--accent);color:#fff;
}
.speed-btn:hover:not(.active){
  background:rgba(124,111,239,0.1);
  border-color:rgba(124,111,239,0.35);
}

/* ─── pet grid ───────────────────────────────────── */
.pet-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(76px,1fr));
  gap:8px;margin-bottom:12px;
}
.pet-card{
  background:rgba(255,255,255,0.03);
  border:1px solid var(--border);
  border-radius:13px;padding:11px 6px 9px;
  text-align:center;cursor:pointer;
  transition:all 0.2s ease;user-select:none;
}
.pet-card:hover{
  background:rgba(124,111,239,0.1);
  border-color:rgba(124,111,239,0.35);
  transform:translateY(-2px);
}
.pet-card.sel{
  background:rgba(124,111,239,0.2);
  border-color:rgba(124,111,239,0.65);
  box-shadow:0 0 14px rgba(124,111,239,0.22);
}
.pet-card .pe{font-size:28px;display:block;margin-bottom:4px;}
.pet-card .pn{font-size:10px;color:var(--muted);line-height:1.3;}
.pet-card.sel .pn{color:var(--accent2);}
.sel-count{color:var(--muted);font-size:12px;text-align:center;}

/* ─── zodiac group label ─────────────────────────── */
.group-label{
  font-size:11px;color:var(--muted);
  letter-spacing:.04em;margin:0 0 8px;
  display:flex;align-items:center;gap:6px;
}
.group-label::after{
  content:'';flex:1;height:1px;
  background:var(--border);
}

/* ─── toggles ────────────────────────────────────── */
.toggle-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:6px 0;
}
.toggle-row + .toggle-row{border-top:1px solid var(--border);}
.toggle-label{font-size:13px;color:var(--text);}
.toggle{
  width:42px;height:23px;border-radius:12px;
  background:rgba(255,255,255,0.1);
  position:relative;cursor:pointer;
  transition:background 0.25s;flex-shrink:0;
}
.toggle.on{background:var(--accent);}
.toggle::after{
  content:'';position:absolute;
  width:17px;height:17px;border-radius:50%;
  background:#fff;top:3px;left:3px;
  transition:transform 0.25s cubic-bezier(.34,1.56,.64,1);
  box-shadow:0 2px 4px rgba(0,0,0,0.25);
}
.toggle.on::after{transform:translateX(19px);}

/* ─── save button ────────────────────────────────── */
.save-btn{
  width:100%;padding:14px;
  background:linear-gradient(135deg,#7c6fef,#b39cf7);
  border:none;border-radius:14px;
  color:#fff;font-size:15px;font-weight:700;
  cursor:pointer;transition:all 0.25s;
  letter-spacing:.4px;margin-top:6px;
}
.save-btn:hover{
  transform:translateY(-2px);
  box-shadow:0 10px 28px rgba(124,111,239,0.45);
}
.save-btn:active{transform:translateY(0);}
.save-btn.saved{background:linear-gradient(135deg,#22c55e,#4ade80);}
</style>
</head>
<body>

<!-- Header -->
<div class="page-header">
  <div class="logo">🐾</div>
  <div class="header-text">
    <h1>Relax Reminder</h1>
    <p>Virtual pets reminding you to take a break at the right time</p>
  </div>
</div>

<!-- Timer status -->
<div class="timer-bar">
  <div>
    <div class="label">⏱ Time until next break</div>
    <div class="progress-track"><div class="progress-fill" id="progressFill" style="width:100%"></div></div>
  </div>
  <div style="text-align:right">
    <div class="timer-val" id="timerVal">--:--</div>
    <div class="timer-btns" style="margin-top:6px">
      <button id="resetBtn">🔄 Reset</button>
      <button id="snoozeBtn">💤 Snooze 15 min</button>
    </div>
  </div>
</div>

<!-- Reminder interval -->
<div class="card">
  <div class="section-label">⏰ Remind me every</div>
  <div class="slider-row">
    <div class="slider-val" id="sliderVal">120<span style="font-size:14px;color:var(--muted)">m</span></div>
    <input type="range" id="intervalSlider" min="5" max="480" step="5" value="120">
  </div>
  <div class="slider-hint">Take a break after <span id="intervalHint">2h</span></div>
</div>

<!-- Pet count -->
<div class="card">
  <div class="section-label">🐾 Number of pets to show</div>
  <div class="count-row">
    <button class="cnt-btn" id="cntDec">−</button>
    <div class="cnt-val" id="cntVal">3</div>
    <button class="cnt-btn" id="cntInc">+</button>
    <span style="color:var(--muted);font-size:12px;margin-left:4px">at a time</span>
  </div>
</div>

<!-- Speed -->
<div class="card">
  <div class="section-label">💨 Movement speed</div>
  <div class="speed-row">
    <button class="speed-btn" data-speed="slow">🐌 Slow</button>
    <button class="speed-btn active" data-speed="normal">🚶 Normal</button>
    <button class="speed-btn" data-speed="fast">🏃 Fast</button>
  </div>
</div>

<!-- Pet selection -->
<div class="card">
  <div class="section-label">🎪 Choose your pets</div>

  <div class="group-label">🏮 12 Chinese Zodiac</div>
  <div class="pet-grid" id="zodiacGrid"></div>

  <div class="group-label" style="margin-top:10px">✨ Extras</div>
  <div class="pet-grid" id="extraGrid"></div>

  <div class="sel-count" id="selCount">Selected: 0 species</div>
</div>

<!-- Options -->
<div class="card">
  <div class="section-label">⚙️ Other Options</div>
  <div class="toggle-row">
    <span class="toggle-label">Auto-show pet panel on VS Code startup</span>
    <div class="toggle on" id="startupToggle"></div>
  </div>
</div>

<button class="save-btn" id="saveBtn">💾 Save Settings</button>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

/* ── Pet definitions ─────────────────────────── */
const ZODIAC = [
  {id:'rat',     emoji:'🐀', name:'Rat',     sub:'Zi'},
  {id:'ox',      emoji:'🐂', name:'Ox',      sub:'Chou'},
  {id:'tiger',   emoji:'🐯', name:'Tiger',   sub:'Yin'},
  {id:'rabbit',  emoji:'🐰', name:'Rabbit',  sub:'Mao'},
  {id:'dragon',  emoji:'🐲', name:'Dragon',  sub:'Chen'},
  {id:'snake',   emoji:'🐍', name:'Snake',   sub:'Si'},
  {id:'horse',   emoji:'🐴', name:'Horse',   sub:'Wu'},
  {id:'goat',    emoji:'🐐', name:'Goat',    sub:'Wei'},
  {id:'monkey',  emoji:'🐒', name:'Monkey',  sub:'Shen'},
  {id:'rooster', emoji:'🐓', name:'Rooster', sub:'You'},
  {id:'dog',     emoji:'🐕', name:'Dog',     sub:'Xu'},
  {id:'pig',     emoji:'🐷', name:'Pig',     sub:'Hai'},
];
const EXTRA = [
  {id:'cat',       emoji:'🐱', name:'Cat'},
  {id:'bird',      emoji:'🐦', name:'Bird'},
  {id:'bee',       emoji:'🐝', name:'Bee'},
  {id:'butterfly', emoji:'🦋', name:'Butterfly'},
  {id:'parrot',    emoji:'🦜', name:'Parrot'},
];

/* ── State ───────────────────────────────────── */
let selectedPets = new Set(['cat','dog','rabbit']);
let petCount = 3;
let speed = 'normal';
let reminderInterval = 120;

/* ── Build pet grids ─────────────────────────── */
function makePetCard(pet) {
  const d = document.createElement('div');
  d.className = 'pet-card' + (selectedPets.has(pet.id) ? ' sel' : '');
  d.dataset.id = pet.id;
  d.innerHTML =
    '<span class="pe">' + pet.emoji + '</span>' +
    '<span class="pn">' + pet.name + (pet.sub ? '
<small>('+pet.sub+')</small>' : '') + '</span>';
  d.addEventListener('click', () => {
    if (selectedPets.has(pet.id)) {
      if (selectedPets.size <= 1) return; // keep at least 1
      selectedPets.delete(pet.id);
      d.classList.remove('sel');
    } else {
      selectedPets.add(pet.id);
      d.classList.add('sel');
    }
    updateSelCount();
  });
  return d;
}
ZODIAC.forEach(p => document.getElementById('zodiacGrid').appendChild(makePetCard(p)));
EXTRA.forEach(p  => document.getElementById('extraGrid').appendChild(makePetCard(p)));

function updateSelCount() {
  document.getElementById('selCount').textContent = 'Selected: ' + selectedPets.size + ' species';
}
updateSelCount();

/* ── Slider ──────────────────────────────────── */
const slider   = document.getElementById('intervalSlider');
const sliderV  = document.getElementById('sliderVal');
const hintEl   = document.getElementById('intervalHint');

function updateSliderDisplay(val) {
  reminderInterval = parseInt(val);
  const h = Math.floor(reminderInterval/60), m = reminderInterval%60;
  sliderV.innerHTML = reminderInterval + '<span style="font-size:14px;color:var(--muted)">m</span>';
  hintEl.textContent = h>0 ? (h+'h'+(m?' '+m+'m':'')) : m+'m';
  // update hint label text
}
slider.addEventListener('input', () => updateSliderDisplay(slider.value));

/* ── Pet count ───────────────────────────────── */
const cntVal = document.getElementById('cntVal');
document.getElementById('cntDec').addEventListener('click', () => {
  if (petCount > 1) { petCount--; cntVal.textContent = petCount; }
});
document.getElementById('cntInc').addEventListener('click', () => {
  if (petCount < 10) { petCount++; cntVal.textContent = petCount; }
});

/* ── Speed ───────────────────────────────────── */
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    speed = btn.dataset.speed;
  });
});

/* ── Toggles ─────────────────────────────────── */
document.querySelectorAll('.toggle').forEach(t => {
  t.addEventListener('click', () => t.classList.toggle('on'));
});

/* ── Timer display ───────────────────────────── */
function fmtTime(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h>0) return h+'h '+String(m).padStart(2,'0')+'m';
  return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}
const timerValEl = document.getElementById('timerVal');
const progressEl = document.getElementById('progressFill');

document.getElementById('resetBtn').addEventListener('click', () => {
  vscode.postMessage({command:'resetTimer'});
});
document.getElementById('snoozeBtn').addEventListener('click', () => {
  vscode.postMessage({command:'snooze',minutes:15});
});

/* ── Save ─────────────────────────────────────── */
document.getElementById('saveBtn').addEventListener('click', () => {
  const btn = document.getElementById('saveBtn');
  const settings = {
    reminderInterval,
    selectedPets: [...selectedPets],
    petCount,
    speed,
    autoShowOnStartup: document.getElementById('startupToggle').classList.contains('on'),
  };
  vscode.postMessage({command:'saveSettings', settings});
  btn.textContent = '✅ Saved!';
  btn.classList.add('saved');
  setTimeout(() => { btn.textContent = '💾 Save Settings'; btn.classList.remove('saved'); }, 2500);
});

/* ── Message handler ─────────────────────────── */
window.addEventListener('message', e => {
  const {command, settings, secondsLeft, totalSeconds} = e.data;

  if (command === 'loadSettings') {
    reminderInterval = settings.reminderInterval || 120;
    petCount         = settings.petCount || 3;
    speed            = settings.speed || 'normal';

    slider.value = reminderInterval;
    updateSliderDisplay(reminderInterval);
    cntVal.textContent = petCount;

    document.querySelectorAll('.speed-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.speed === speed);
    });

    selectedPets = new Set(settings.selectedPets || ['cat','dog','rabbit']);
    document.querySelectorAll('.pet-card').forEach(c => {
      c.classList.toggle('sel', selectedPets.has(c.dataset.id));
    });
    updateSelCount();

    if (settings.autoShowOnStartup !== undefined) {
      document.getElementById('startupToggle').classList.toggle('on', settings.autoShowOnStartup);
    }
  }

  if (command === 'timerTick') {
    timerValEl.textContent = fmtTime(secondsLeft);
    const pct = totalSeconds > 0 ? (secondsLeft/totalSeconds)*100 : 100;
    progressEl.style.width = pct + '%';
    const low = pct < 10;
    progressEl.style.background = low
      ? 'linear-gradient(90deg,#ef4444,#f97316)'
      : pct < 25
        ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
        : 'linear-gradient(90deg,#7c6fef,#b39cf7)';
  }
});

vscode.postMessage({command:'ready'});
</script>
</body>
</html>`;
  }
}
 