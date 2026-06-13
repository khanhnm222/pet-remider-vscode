/// <reference types="node" />
import * as vscode from 'vscode';
import { TimerManager } from './timerManager';
import { PetViewProvider } from './petViewProvider';
import { SettingsPanel } from './settingsPanel';

export function activate(context: vscode.ExtensionContext): void {
  // ── Core services ──────────────────────────────────────────
  const timerManager  = new TimerManager(context);
  const petViewProvider = new PetViewProvider(context, timerManager);

  // ── Register the pet view in the bottom panel ──────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PetViewProvider.viewType,
      petViewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // ── Commands ───────────────────────────────────────────────
  const commands = [
    vscode.commands.registerCommand('relaxReminder.showPets', () => {
      vscode.commands.executeCommand('relaxReminder.petView.focus');
    }),
    vscode.commands.registerCommand('relaxReminder.openSettings', () => {
      SettingsPanel.createOrShow(context, timerManager, petViewProvider);
    }),
    vscode.commands.registerCommand('relaxReminder.resetTimer', () => {
      timerManager.resetTimer();
      vscode.window.showInformationMessage('🐾 Relax Reminder: Timer has been reset!');
    }),
    vscode.commands.registerCommand('relaxReminder.snooze', () => {
      timerManager.snooze(15);
      vscode.window.showInformationMessage('💤 Snoozed! Will remind you again in 15 minutes.');
    }),
  ];
  context.subscriptions.push(...commands);

  // ── Reminder notification ──────────────────────────────────
  timerManager.onReminder(async () => {
    const reminderText = "Time to take a break! Step away for a moment 😊";
    petViewProvider.sendReminder(reminderText);

    // Focus the pet panel so user sees the animation
    vscode.commands.executeCommand('relaxReminder.petView.focus');

    const choice = await vscode.window.showInformationMessage(
      `🐾 Relax Reminder: ${reminderText}`,
      { modal: false },
      'Reset Timer',
      'Snooze 15 min',
      'Dismiss',
    );

    if (choice === 'Reset Timer') {
      timerManager.resetTimer();
    } else if (choice === 'Snooze 15 min') {
      timerManager.snooze(15);
    }
  });

  // ── Auto-show panel on startup ─────────────────────────────
  const cfg = vscode.workspace.getConfiguration('relaxReminder');
  if (cfg.get<boolean>('autoShowOnStartup', true)) {
    // Small delay to let VS Code finish initialising
    setTimeout(() => {
      vscode.commands.executeCommand('relaxReminder.petView.focus');
    }, 1500);
  }

  // ── Cleanup ────────────────────────────────────────────────
  context.subscriptions.push({
    dispose: () => timerManager.dispose(),
  });
}

export function deactivate(): void {
  // Nothing extra needed – subscriptions handle cleanup
}
 