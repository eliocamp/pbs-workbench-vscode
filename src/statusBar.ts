import * as vscode from "vscode";
import { WorkbenchManager, WorkbenchInfo, timeRemaining, ramUsedGb, ramTotalGb } from "./workbenchManager";

// Colour thresholds for time remaining
const WARN_SECONDS = 3600;      
const DANGER_SECONDS = 3600 / 2;    

const FAST_POLL_MS = 10_000;       // 10s while queued
const NORMAL_POLL_MS = 60_000;     // 60s while running

const STATE_LABELS: Record<string, string> = {
  Q: "Queued",
  R: "Running",
  H: "Held",
  E: "Exiting",
};

export class StatusBarController implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private pollTimer: NodeJS.Timeout | undefined;
  private currentPollMs: number = NORMAL_POLL_MS;
  private manager: WorkbenchManager;
  private lastState: string | null = null;

  constructor(manager: WorkbenchManager) {
    this.manager = manager;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      10,
    );
    this.statusBarItem.command = "workbench.showActions";
  }

  async refresh(): Promise<void> {
    this.showRefreshing();
    const prevState = this.lastState;
    const info = await this.manager.fetchInfo();

    if (!info) {
      this.lastState = null;
      this.hide();
      return;
    }
    this.lastState = info.state;
    this.update(info);
    this.ensurePolling(info.state);
    if ((prevState === "Q" || prevState === "H") && info.state === "R") {
      vscode.window.showInformationMessage(
        `Workbench is ready on ${info.hostname}`,
        "Connect",
      ).then(choice => {
        if (choice === "Connect") {
          vscode.commands.executeCommand("workbench.connectCurrentWindow");
        }
      });
    }
  }

  /** Show the status bar immediately with a queued state, then begin fast polling */
  showQueued(): void {
    this.statusBarItem.text = `$(server) PBS Workbench — Queued`;
    this.statusBarItem.tooltip = "Workbench is starting…";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
    this.startPolling(FAST_POLL_MS);
  }

  showRefreshing(): void {
    this.statusBarItem.text = this.statusBarItem.text.replace(/^\$\([^)]+\)/, "$(sync~spin)");
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  private update(info: WorkbenchInfo): void {
    const label = STATE_LABELS[info.state] ?? info.state;
    const isRunning = info.state === "R";
    const remaining = timeRemaining(info);

    this.statusBarItem.text = isRunning
      ? `$(server) PBS Workbench ${formatSeconds(remaining)}`
      : `$(server) PBS Workbench — ${label}`;

    this.statusBarItem.tooltip = buildTooltip(info);
    this.statusBarItem.backgroundColor = isRunning
      ? getColour(remaining)
      : undefined;
    this.statusBarItem.show();
  }

  private hide(): void {
    this.statusBarItem.text = `$(server) PBS Workbench`;
    this.statusBarItem.tooltip = undefined;
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.hide();
    this.stopPolling();
  }

  private ensurePolling(state: string): void {
    const targetMs = state === "R" ? NORMAL_POLL_MS : FAST_POLL_MS;
    if (this.pollTimer && this.currentPollMs === targetMs) return;
    this.startPolling(targetMs);
  }

  private startPolling(intervalMs: number): void {
    this.stopPolling();
    this.currentPollMs = intervalMs;

    this.pollTimer = setInterval(async () => {
      await this.refresh();
    }, intervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  dispose(): void {
    this.stopPolling();
    this.statusBarItem.dispose();
  }
}

function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getColour(seconds: number): vscode.ThemeColor | undefined {
  if (seconds <= DANGER_SECONDS) {
    return new vscode.ThemeColor("statusBarItem.errorBackground");
  }
  if (seconds <= WARN_SECONDS) {
    return new vscode.ThemeColor("statusBarItem.warningBackground");
  }
  return undefined;
}

export function suIncurred(info: WorkbenchInfo): number {
  if (info.requested.walltime === 0) return 0;
  return info.su * (info.used.walltime / info.requested.walltime);
}

function buildTooltip(info: WorkbenchInfo): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  const isRunning = info.state === "R";
  const label = STATE_LABELS[info.state] ?? info.state;

  md.appendMarkdown(`### HPC Workbench\n\n`);
  md.appendMarkdown(`| | |\n|---|---|\n`);
  md.appendMarkdown(`| **Job ID** | ${info.job_id} |\n`);
  md.appendMarkdown(`| **State** | ${label} |\n`);
  md.appendMarkdown(`| **Queue** | ${info.queue} |\n`);
  if (info.hostname) {
    md.appendMarkdown(`| **Node** | ${info.hostname} |\n`);
  }
  if (isRunning) {
    const remaining = timeRemaining(info);
    md.appendMarkdown(`| **Time remaining** | ${formatSeconds(remaining)} |\n`);
    md.appendMarkdown(`| **CPUs** | ${info.requested.ncpus} |\n`);
    md.appendMarkdown(`| **CPU usage** | ${info.used.cpu.toFixed(1)}% |\n`);
    md.appendMarkdown(
      `| **RAM** | ${ramUsedGb(info).toFixed(1)} / ${ramTotalGb(info).toFixed(1)} GB |\n`,
    );
    md.appendMarkdown(`| **SU cost** | ${suIncurred(info).toFixed(2)} / ${info.su.toFixed(2)} |\n`);
  }
  md.appendMarkdown(`\n_Click to manage workbench_`);

  return md;
}
