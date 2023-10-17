import { app, BrowserWindow, BrowserWindowConstructorOptions, Menu, MenuItemConstructorOptions, nativeImage, nativeTheme, systemPreferences, Tray } from 'electron';
import * as http from 'http';
import * as _path from 'path';
import * as WebSocket from 'ws';
import { Config } from '../config';
import { Utils } from '../utils'
import { Handler } from '../models/handler.model';
import { SettingsHandler } from './settings.handler';


export class UiHandler implements Handler {
    public static WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
        width: 1024, height: 768,
        minWidth: 800, minHeight: 600,
        title: Config.APP_NAME,
        webPreferences: {
            preload: _path.join(__dirname, '../preload.js'),
            contextIsolation: true,
            nodeIntegration: true,
            nativeWindowOpen: false,
        }
    };

    public tray: Tray = null;
    public mainWindow: BrowserWindow;
    private settingsHandler: SettingsHandler;
    private ipcClient;
    public quitImmediately = false;

    static IsFirstInstanceLaunch = true;

    private static instance: UiHandler;
    private constructor(settingsHandler: SettingsHandler,) {
        if (!app.requestSingleInstanceLock()) {
            this.quitImmediately = true;
            app.quit();
            return;
        }
        app.on('second-instance', (event, argv, workingDirectory) => {
            this.mainWindow.webContents.send('second-instance-open', argv)
            this.bringWindowUp();
        })

        let canTriggerSettingsReadyCounter = 0;
        this.settingsHandler = settingsHandler;

        settingsHandler.onSettingsChanged.subscribe((settings) => {
            this.updateTray();
            canTriggerSettingsReadyCounter++;
            if (canTriggerSettingsReadyCounter == 2) this.onSettingsReady()
        });

        app.on('ready', () => {
            this.createWindow();
            canTriggerSettingsReadyCounter++;
            if (canTriggerSettingsReadyCounter == 2) this.onSettingsReady()
        });

        app.on('window-all-closed', () => {
            app.quit()
        })
        app.setName(Config.APP_NAME);
        if (app.setAboutPanelOptions) {
            app.setAboutPanelOptions({
                applicationName: Config.APP_NAME,
                applicationVersion: app.getVersion(),
                credits: Config.AUTHOR,
            });
        }
    }

    public onSettingsReady() {
        this.autoMinimize();
    }

    static getInstance(settingsHandler: SettingsHandler) {
        if (!UiHandler.instance) {
            UiHandler.instance = new UiHandler(settingsHandler);
        }
        return UiHandler.instance;
    }

    private updateTray() {
        if (this.settingsHandler.enableTray) {
            if (this.tray == null) {
                let menuItems: MenuItemConstructorOptions[] = [
                    {
                        label: 'Exit', click: () => {
                            this.quitImmediately = true;
                            app.quit();
                        }
                    },
                ];
                if (process.platform == 'darwin') {
                    const icon = nativeImage.createFromPath(_path.join(__dirname, '/../assets/tray/macos/icon.png'));
                    icon.setTemplateImage(true)
                    this.tray = new Tray(icon);
                    menuItems.unshift({ label: 'Hide', role: 'hide' });
                    menuItems.unshift({ label: 'Show', click: () => { this.bringWindowUp(); } });
                } else if (process.platform.indexOf('win') != -1) {
                    this.tray = new Tray(nativeImage.createFromPath((_path.join(__dirname, '/../assets/tray/windows/icon.ico'))));
                } else {
                    this.tray = new Tray(nativeImage.createFromPath((_path.join(__dirname, '/../assets/tray/default.png'))));
                    menuItems.unshift({ label: 'Hide', role: 'hide', click: () => { this.mainWindow.hide(); } });
                    menuItems.unshift({ label: 'Show', click: () => { this.bringWindowUp(); } });
                }

                this.tray.on('click', (event, bounds) => {
                    if (process.platform != 'darwin') this.mainWindow.isVisible() ? this.mainWindow.hide() : this.mainWindow.show()
                });

                const contextMenu = Menu.buildFromTemplate(menuItems);
                this.tray.setContextMenu(contextMenu);
                this.tray.setToolTip(app.getName() + ' is running');
            }
        } else {
            if (this.tray != null) {
                this.tray.destroy();
                this.tray = null;
            }
        }
    }

    private bringWindowUp() {
        if (this.mainWindow) {
            if (this.mainWindow.isMinimized()) this.mainWindow.restore();
            this.mainWindow.show();
            this.mainWindow.focus();
            if (app.dock != null) {
                app.dock.show();
            }
        }
    }

    private autoMinimize() {
        if (!UiHandler.IsFirstInstanceLaunch) {
            return;
        }

        if (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden) {
            this.mainWindow.hide();
            if (this.settingsHandler.enableTray && app.dock != null) {
                app.dock.hide();
            }
        }

        if (process.platform !== 'darwin' && this.settingsHandler.openAutomatically == 'minimized') {
            if (this.settingsHandler.enableTray) {
                this.mainWindow.hide();
            } else {
                this.mainWindow.minimize();
            }
        }
        UiHandler.IsFirstInstanceLaunch = false;
    }

    private createWindow() {
        this.mainWindow = new BrowserWindow(UiHandler.WINDOW_OPTIONS);
        require("@electron/remote/main").enable(this.mainWindow.webContents)
        if (Utils.IsDev()) {
            console.log('dev mode on')
            this.mainWindow.webContents.on('did-fail-load', () => {
                this.mainWindow.webContents.executeJavaScript(`document.write('Building Ionic project, please wait...')`);
                setTimeout(() => this.mainWindow.reload(), 2000);
            })
            this.mainWindow.loadURL('http://localhost:8200/');
            this.mainWindow.webContents.openDevTools();
        } else {
            this.mainWindow.loadURL(_path.join('file://', __dirname, '../www/index.html'));
        }

        if (process.platform === 'darwin') {
            let template: MenuItemConstructorOptions[] = [
                {
                    label: Config.APP_NAME,
                    submenu: [
                        { role: 'about' },
                        { type: 'separator' },
                        { role: 'services', submenu: [] },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        {
                            label: 'Quit ' + Config.APP_NAME, click: (menuItem, browserWindow, event) => {
                                this.quitImmediately = true;
                                app.quit();
                            },
                            accelerator: 'CmdOrCtrl+Q',
                            registerAccelerator: true,
                        }
                    ]
                },
                {
                    label: 'Edit',
                    submenu: [
                        { role: "cut" },
                        { role: "copy" },
                        { role: "paste" },
                        { role: "selectAll" },
                        { type: 'separator' },
                        {
                            label: 'Find',
                            accelerator: process.platform === 'darwin' ? 'Cmd+F' : 'Ctrl+F',
                            click: () => {
                                this.ipcClient.send('find');
                            }
                        },
                    ]
                },
                {
                    label: 'View',
                    submenu: [
                        { role: 'resetZoom' },
                        { role: 'zoomIn' },
                        { role: 'zoomOut' },
                        { type: 'separator' },
                        { role: 'togglefullscreen' }
                    ]
                },
                {
                    role: 'window',
                    submenu: [
                        { role: 'minimize' },
                        { role: 'close' },
                        { role: 'zoom' },
                        { type: 'separator' },
                        { role: 'front' }
                    ]
                },
                {
                    role: 'help',
                    submenu: [

                    ]
                }
            ]
            const menu = Menu.buildFromTemplate(template)
            Menu.setApplicationMenu(menu)
        }

        this.mainWindow.on('close', (event) => {
            event.returnValue = true;
            if (this.quitImmediately) {
                return true;
            }

            if (!this.settingsHandler) {
                return true;
            }

            if (this.settingsHandler.enableTray) {
                event.preventDefault();
                this.mainWindow.hide();
                if (app.dock != null) {
                    app.dock.hide();
                }
                event.returnValue = false
                return false;
            }
            return true;
        });

        this.mainWindow.on('closed', () => {
            this.mainWindow = null
        })

        if (this.mainWindow.isVisible()) {
            if (app.dock != null) {
                app.dock.show();
            }
        }

        const selectionMenu = Menu.buildFromTemplate([
            { role: 'copy' },
            { type: 'separator' },
            { role: 'selectAll' },
        ]);

        const inputMenu = Menu.buildFromTemplate([
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { type: 'separator' },
            { role: 'selectAll' },
        ])

        this.mainWindow.webContents.on('context-menu', (e, props) => {
            const { selectionText, isEditable } = props;
            if (isEditable) {
                inputMenu.popup({ window: this.mainWindow });
            } else if (selectionText && selectionText.trim() !== '') {
                selectionMenu.popup({ window: this.mainWindow });
            }
        })
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

    setIpcClient(ipcClient) {
        this.ipcClient = ipcClient;
    }
}
