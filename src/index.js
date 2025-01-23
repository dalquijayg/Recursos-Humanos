const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { validateHeaderName } = require('http');

log.transports.file.resolvePathFn = () => path.join('C:/Users/Dennis/Desktop/Vacas RRHH', 'logs/main.log');
log.log("Version de la App " + app.getVersion());
if(process.env.NODE_ENV !=='production'){
    require('electron-reload')(__dirname,{
        
    })
}
let mainWindow;
let ventanaboni = null;
let ventanaautoboni = null;
let ventanaEntregas =null;

function createWindow() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });

    mainWindow.maximize();
    mainWindow.loadURL(`file://${__dirname}/Vistas/Autenticacion.html`);

    mainWindow.webContents.once('dom-ready', () => {
        autoUpdater.checkForUpdatesAndNotify();
    });
}
function open_Adicionales() {
    // Verificar si la ventana ya está abierta
    if (ventanaboni) {
        if (ventanaboni.isMinimized()) ventanaboni.restore(); // Restaurar si está minimizada
        ventanaboni.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanaboni = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanaboni.maximize();
    ventanaboni.loadURL(`file://${__dirname}/Vistas/RegistroBoni.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanaboni.on('closed', () => {
        ventanaboni = null;
    });
}
function open_Autorizaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanaautoboni) {
        if (ventanaautoboni.isMinimized()) ventanaautoboni.restore(); // Restaurar si está minimizada
        ventanaautoboni.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanaautoboni = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanaautoboni.maximize();
    ventanaautoboni.loadURL(`file://${__dirname}/Vistas/AutorizacionBoni.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanaautoboni.on('closed', () => {
        ventanaautoboni = null;
    });
}
function open_Entrega() {
    // Verificar si la ventana ya está abierta
    if (ventanaEntregas) {
        if (ventanaEntregas.isMinimized()) ventanaEntregas.restore(); // Restaurar si está minimizada
        ventanaEntregas.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanaEntregas = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanaEntregas.maximize();
    ventanaEntregas.loadURL(`file://${__dirname}/Vistas/EntregaBoni.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanaEntregas.on('closed', () => {
        ventanaEntregas = null;
    });
}
app.on('ready', createWindow);
ipcMain.on('open_adicionales', () => {
    open_Adicionales();
});
ipcMain.on('open_Autorizaciones', () => {
    open_Autorizaciones();
});
ipcMain.on('open_Entregas', () => {
    open_Entrega();
});
autoUpdater.on('update-available', (info) => {
    log.info("update available");
    mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', (info) => {
    log.info("update-downloaded");
    mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});