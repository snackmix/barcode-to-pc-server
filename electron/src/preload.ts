import { app, dialog, getCurrentWindow, process, systemPreferences } from "@electron/remote";
import { contextBridge, ipcRenderer, Menu, MenuItem, shell } from "electron";
import * as fs from 'fs';
import * as nodeMachineId from 'node-machine-id';
import * as os from 'os';
import * as path from 'path';
import { v4 } from 'uuid';

contextBridge.exposeInMainWorld('preload', {
    ipcRenderer: {
        on(channel, listener) {
            return ipcRenderer.on(channel, listener);
        },
        send(channel, ...args) {
            return ipcRenderer.send(channel, args);
        },
    },
    showSaveDialogSync: (options) => {
        return dialog.showSaveDialogSync(getCurrentWindow(), options);
    },
    showMessageBoxSync: (options) => {
        return dialog.showMessageBoxSync(null, options);
    },
    showOpenDialogSync: (options) => {
        return dialog.showOpenDialogSync(getCurrentWindow(), options);
    },
    appGetVersion: app.getVersion,
    appGetLoginItemSettings: app.getLoginItemSettings,
    appSetLoginItemSettings: app.setLoginItemSettings,
    appGetPath: app.getPath,
    shell: shell,
    Menu: Menu,
    MenuItem: MenuItem,
    store: {
        get(key, defaultValue) {
            return ipcRenderer.sendSync('electron-store-get', key, defaultValue);
        },
        set(key, value) {
            ipcRenderer.send('electron-store-set', key, value);
        },
    },
    nodeMachineId: nodeMachineId,
    v4: v4,
    processPlatform: process.platform,
    processArgv: process.argv,
    path: path,
    systemPreferences: systemPreferences,
    systemPreferencesIsTrustedAccessibilityClient: systemPreferences.isTrustedAccessibilityClient,
    os: os,
    fsWriteFileSync: (path, data, options) => {
        return fs.writeFileSync(path, data, options);
    },
    fsReadFileSync: (path, options) => {
        return fs.readFileSync(path, options);
    },
})
