import * as vscode from 'vscode';
import { setInterval, clearInterval } from 'timers';

export type TimerUpdateCallback = (secondsLeft: number) => void;
export type ReminderCallback = () => void;

export class TimerManager {
  private _intervalSeconds: number;
  private _secondsLeft: number;
  private _tickTimer: ReturnType<typeof setInterval> | undefined;
  private _updateCallbacks: TimerUpdateCallback[] = [];
  private _reminderCallbacks: ReminderCallback[] = [];
  private readonly _statusBarItem: vscode.StatusBarItem;

  constructor(private readonly _context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('relaxReminder');
    const minutes = config.get<number>('reminderIntervalMinutes', 120);
    this._intervalSeconds = minutes * 60;
    this._secondsLeft = this._intervalSeconds;

    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._statusBarItem.command = 'relaxReminder.openSettings';
    this._statusBarItem.show();
    _context.subscriptions.push(this._statusBarItem);

    this._startTicking();

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('relaxReminder.reminderIntervalMinutes')) {
        const newMinutes = vscode.workspace.getConfiguration('relaxReminder').get<number>('reminderIntervalMinutes', 120);
        this._intervalSeconds = newMinutes * 60;
        this.resetTimer();
      }
    }, undefined, _context.subscriptions);
  }

  private _startTicking(): void {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
    }
    this._tickTimer = setInterval(() => {
      this._secondsLeft--;
      this._notifyUpdate();
      if (this._secondsLeft <= 0) {
        this._fireReminder();
        this.resetTimer();
      }
    }, 1000);
  }

  private _notifyUpdate(): void {
    this._updateStatusBar();
    this._updateCallbacks.forEach(cb => cb(this._secondsLeft));
  }

  private _updateStatusBar(): void {
    const totalMins = Math.ceil(this._secondsLeft / 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    this._statusBarItem.text = `🐾 Break in: ${timeStr}`;
    this._statusBarItem.tooltip = `Relax Reminder: Next break in ${timeStr}\nClick to open settings`;

    // Color changes as time approaches
    const ratio = this._secondsLeft / this._intervalSeconds;
    if (ratio < 0.1) {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (ratio < 0.25) {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this._statusBarItem.backgroundColor = undefined;
    }
  }

  private _fireReminder(): void {
    this._reminderCallbacks.forEach(cb => cb());
  }

  public resetTimer(): void {
    const config = vscode.workspace.getConfiguration('relaxReminder');
    const minutes = config.get<number>('reminderIntervalMinutes', 120);
    this._intervalSeconds = minutes * 60;
    this._secondsLeft = this._intervalSeconds;
    this._notifyUpdate();
  }

  public snooze(minutes: number): void {
    this._secondsLeft = minutes * 60;
    this._notifyUpdate();
  }

  public getSecondsLeft(): number {
    return this._secondsLeft;
  }

  public getTotalSeconds(): number {
    return this._intervalSeconds;
  }

  public onUpdate(callback: TimerUpdateCallback): void {
    this._updateCallbacks.push(callback);
  }

  public onReminder(callback: ReminderCallback): void {
    this._reminderCallbacks.push(callback);
  }

  public dispose(): void {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
    }
    this._updateCallbacks = [];
    this._reminderCallbacks = [];
  }
}
 