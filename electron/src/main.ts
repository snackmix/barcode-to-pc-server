import { app, ipcMain, ipcRenderer } from 'electron';
import * as WebSocket from 'ws';
import { Config } from './config';
import { ConnectionHandler } from './handlers/connection.handler';
import { ScansHandler } from './handlers/scans.handler';
import { SettingsHandler } from './handlers/settings.handler';
import { UiHandler } from './handlers/ui.handler';
import * as http from 'http';
import ElectronStore = require('electron-store');
require('@electron/remote/main').initialize()

let wss = null;
const settingsHandler = SettingsHandler.getInstance();
const uiHandler = UiHandler.getInstance(settingsHandler);
const scansHandler = ScansHandler.getInstance(settingsHandler, uiHandler);
const connectionHandler = ConnectionHandler.getInstance(uiHandler, settingsHandler);

let ipcClient: Electron.WebContents, lastArgv;

const store = new ElectronStore();
ipcMain.on('electron-store-get', async (event, key, defaultValue) => {
    event.returnValue = store.get(key, defaultValue);
});
ipcMain.on('electron-store-set', async (event, key, value) => {
    store.set(key, value);
});

ipcMain
    .on('pageLoad', (event) => {
        if (wss != null || event.sender == null) {
            return;
        }

        ipcClient = event.sender;

        if (lastArgv) {
            ipcClient.send('second-instance-open', lastArgv);
            lastArgv = null;
        }

        wss = new WebSocket.Server({ port: Config.PORT });
        connectionHandler.announceServer();
        connectionHandler.setIpcClient(ipcClient);
        uiHandler.setIpcClient(ipcClient);
        scansHandler.setIpcClient(ipcClient);

        wss.on('connection', (ws, req: http.IncomingMessage) => {
            console.log("ws(incoming connection)", req.connection.remoteAddress)

            ws.on('message', async message => {
                console.log('ws(message): ', message)
                if (!uiHandler.mainWindow) {
                    return;
                }

                let messageObj = JSON.parse(message.toString());

                messageObj = await scansHandler.onWsMessage(ws, messageObj, req);
                messageObj = await connectionHandler.onWsMessage(ws, messageObj, req);

                ipcClient.send(messageObj.action, messageObj);
            });

            ws.on('close', () => {
                console.log('ws(close)', req.connection.remoteAddress);
                connectionHandler.onWsClose(ws);
            });

            ws.on('error', (err) => {
                console.log('ws(error): ', err, req.connection.remoteAddress);
                connectionHandler.onWsError(ws, err);
            });
        });

        app.on('window-all-closed', () => {
            closeServer();
            app.quit();
        });
    })

app.on('will-finish-launching', () => {
    app.on('open-file', (event, path) => {
        event.preventDefault();
        let argv = ['', path];
        lastArgv = argv;
        if (ipcClient) {
            ipcClient.send('second-instance-open', argv);
        }
    });
})

function closeServer() {
    console.log('closing server')
    if (wss) {
        wss.close();
        wss = null;
        connectionHandler.removeServerAnnounce();
    }
}
