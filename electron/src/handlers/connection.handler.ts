import * as b from 'bonjour';
import { app, dialog, ipcMain } from 'electron';
import * as http from 'http';
import * as network from 'network';
import * as os from 'os';
import { Handler } from 'src/models/handler.model';
import * as WebSocket from 'ws';
import { requestModel, requestModelHelo } from '../models/ionic/request.model';
import {
    responseModel, responseModelHelo,
    responseModelKick,
    responseModelPong,
    responseModelUpdateSettings
} from '../models/ionic/response.model';
import { SettingsModel } from '../models/ionic/settings.model';
import { Config } from '../config';
import { SettingsHandler } from './settings.handler';
import { UiHandler } from './ui.handler';

export class ConnectionHandler implements Handler {
    public static EVENT_CODE_KICKED_OUT = 4001;

    private fallBackBonjour: b.Service;
    private mdnsAd: any;
    private bonjour: any;

    private wsClients = {};
    private ipcClient;

    private static instance: ConnectionHandler;

    constructor(
        public uiHandler: UiHandler,
        public settingsHandler: SettingsHandler
    ) {
        this.uiHandler = uiHandler;
        ipcMain
            .on('getLocalAddresses', (event, arg) => {
                network.get_interfaces_list((err, networkInterfaces) => {
                    let addresses = [];

                    for (let key in networkInterfaces) {
                        let ip = networkInterfaces[key].ip_address;
                        if (ip) {
                            addresses.push(ip);
                        }
                    };
                    event.sender.send('localAddresses', addresses);
                });
            }).on('getDefaultLocalAddress', (event, arg) => {
                network.get_private_ip((err, ip) => {
                    event.sender.send('defaultLocalAddress', ip);
                });
            }).on('getHostname', (event, arg) => {
                event.sender.send('hostname', os.hostname());
            }).on('kick', (event, data: ({ deviceId: number, response: responseModelKick })) => {
                console.log('@Kick', data.deviceId)
                if (data.deviceId in this.wsClients) {
                    this.wsClients[data.deviceId].send(JSON.stringify(data.response));
                }
            })
        settingsHandler.onSettingsChanged.subscribe((settings: SettingsModel) => {
            for (let deviceId in this.wsClients) {
                let ws = this.wsClients[deviceId];
                ws.send(JSON.stringify(new responseModelUpdateSettings().fromObject({
                    outputProfiles: this.settingsHandler.outputProfiles,
                    events: this.getEnabledEvents(),
                })));
            }
        });
    }

    /**
     * Generates an array of enabled events basend on the server settings, like this:
     * ['on_smartphone_charge', 'on_scansession_archieved']
     */
    getEnabledEvents(): string[] {
        let enabledEvents: string[] = [];
        if (this.settingsHandler.onSmartphoneChargeCommand) {
            enabledEvents.push(responseModel.EVENT_ON_SMARTPHONE_CHARGE);
        }
        return enabledEvents;
    }

    static getInstance(uiHandler: UiHandler, settingsHandler: SettingsHandler) {
        if (!ConnectionHandler.instance) {
            ConnectionHandler.instance = new ConnectionHandler(uiHandler, settingsHandler);
        }
        return ConnectionHandler.instance;
    }

    announceServer() {
        try {
            let mdns = require('mdns');
            this.mdnsAd = mdns.createAdvertisement(mdns.tcp('http'), Config.PORT);
            this.mdnsAd.start();
        } catch (ex) {
            console.log('node_mdns error, faillback to bonjour')
            try {
                this.bonjour = b();
                this.fallBackBonjour = this.bonjour.publish({ name: Config.APP_NAME, type: 'http', port: Config.PORT })
            } catch (ex) {}
        }
    }

    removeServerAnnounce() {
        if (this.fallBackBonjour) {
            this.bonjour.unpublishAll(() => { })
        }

        if (this.mdnsAd) {
            this.mdnsAd.stop();
        }
    }

    async onWsMessage(ws: WebSocket, message: any, req: http.IncomingMessage): Promise<any> {
        switch (message.action) {
            case requestModel.ACTION_PING: {
                ws.send(JSON.stringify(new responseModelPong()));
                break;
            }

            case requestModel.ACTION_HELO: {
                let request: requestModelHelo = message;
                let response = new responseModelHelo();
                response.fromObject({
                    version: app.getVersion(),
                    outputProfiles: this.settingsHandler.outputProfiles,
                    events: this.getEnabledEvents(),
                    /**
                     * @deprecated
                     */
                    quantityEnabled: false,
                    serverUUID: this.settingsHandler.getServerUUID()
                });

                if (request && request.deviceId) {
                    this.wsClients[request.deviceId] = ws;
                }
                ws.send(JSON.stringify(response));
                break;
            }
        }
        return message;
    }

    onWsClose(ws: WebSocket) {
        if (this.ipcClient) {
            this.findDeviceIdByWs(ws).then(deviceId => {
                this.ipcClient.send('wsClose', { deviceId: deviceId })
            });
        }
        this.removeClient(ws);
    }

    onWsError(ws: WebSocket, err: Error) {
        if (this.ipcClient) {
            this.findDeviceIdByWs(ws).then(deviceId => {
                this.ipcClient.send('wsError', { deviceId: deviceId, err: err })
            });
        }
        this.removeClient(ws);
    }

    setIpcClient(ipcClient) {
        this.ipcClient = ipcClient;
    }

    private findDeviceIdByWs(ws) {
        return new Promise((resolve, reject) => {
            Object.keys(this.wsClients).forEach((key) => {
                if (this.wsClients[key] == ws) {
                    resolve(key);
                }
            });
        })
    }

    private removeClient(ws: WebSocket) {
        Object.keys(this.wsClients).forEach((key) => {
            delete this.wsClients[key];
        });
    }
}

