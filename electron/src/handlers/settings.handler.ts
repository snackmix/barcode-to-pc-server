import { ipcMain } from 'electron';
import * as http from 'http';
import { ReplaySubject } from 'rxjs';
import * as WebSocket from 'ws';
import { OutputProfileModel } from '../models/ionic/output-profile.model';
import { SettingsModel } from '../models/ionic/settings.model';
import { Config } from '../config';
import { Handler } from '../models/handler.model';
import ElectronStore = require('electron-store');
import { machineIdSync } from 'node-machine-id';
import { v4 } from 'uuid';
import * as os from 'os'

export class SettingsHandler implements Handler {
    public onSettingsChanged: ReplaySubject<SettingsModel> = new ReplaySubject<SettingsModel>();
    private settings: SettingsModel;

    private static instance: SettingsHandler;
    private store: ElectronStore;

    private constructor() {
        this.store = new ElectronStore();

        ipcMain.on('settings', (event, arg) => {
            const settings: any = this.store.get(Config.STORAGE_SETTINGS, new SettingsModel(os.platform().toLowerCase())) ;
            this.settings = settings;
            this.onSettingsChanged.next(this.settings);
        });
    }

    static getInstance() {
        if (!SettingsHandler.instance) {
            SettingsHandler.instance = new SettingsHandler();
        }
        return SettingsHandler.instance;
    }

    get enableRealtimeStrokes(): boolean {
        return this.settings.enableRealtimeStrokes
    }
    get enableOpenInBrowser(): boolean {
        return this.settings.enableOpenInBrowser
    }
    get outputProfiles(): OutputProfileModel[] {
        return this.settings.outputProfiles
    }
    get newLineCharacter(): string {
        return this.settings.newLineCharacter
    }
    get csvDelimiter(): string {
        return this.settings.csvDelimiter
    }
    get exportOnlyText(): boolean {
        return this.settings.exportOnlyText
    }
    get enableQuotes(): boolean {
        return this.settings.enableQuotes
    }
    get enableTray(): boolean {
        return this.settings.enableTray
    }
    get openAutomatically(): ('yes' | 'no' | 'minimized') {
        return this.settings.openAutomatically
    }
    get csvPath(): string {
        return this.settings.csvPath
    }
    get appendCSVEnabled(): boolean {
        return this.settings.appendCSVEnabled
    }
    get typeMethod() {
        return this.settings.typeMethod
    }
    get autoUpdate() {
        return this.settings.autoUpdate
    }
    get onSmartphoneChargeCommand() {
        return this.settings.onSmartphoneChargeCommand
    }

    async onWsMessage(ws: WebSocket, message: any, req: http.IncomingMessage): Promise<any> {
        throw new Error("Method not implemented.");
        return message;
    }
    onWsClose(ws: WebSocket) {
        throw new Error("Method not implemented.");
    }
    onWsError(ws: WebSocket, err: Error) {
        throw new Error("Method not implemented.");
    }

    public getServerUUID(): string {
        try {
            return machineIdSync();
        } catch {
            let uuid: any;
            uuid = this.store.get('uuid', null);
            if (uuid == null) {
                uuid = v4();
                this.store.set('uuid', uuid);
            }
            return uuid;
        }
    }
}
