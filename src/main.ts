import dotenv from 'dotenv';
dotenv.config();

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { getDb, closeDb } from './db';
import { registerIpc } from './ipc/register';
import {
  needsExitDriveBackup,
  runExitDriveBackupIfNeeded,
  startDriveBackupScheduler,
} from './main/drive-backup-scheduler';

// These are injected by the Electron Forge Vite plugin.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

function getAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico');
  }
  return path.join(__dirname, '../../assets/icons/icon.ico');
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    title: 'PillOpsDesk',
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
};

app.whenReady().then(() => {
  // Initialise DB (runs migrations) before wiring handlers.
  getDb();
  registerIpc();
  startDriveBackupScheduler();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let quitting = false;

app.on('before-quit', (e) => {
  if (quitting) return;
  if (!needsExitDriveBackup()) {
    closeDb();
    return;
  }

  e.preventDefault();
  quitting = true;
  void runExitDriveBackupIfNeeded().finally(() => {
    closeDb();
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (!quitting) closeDb();
    app.quit();
  }
});
