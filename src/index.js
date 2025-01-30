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
let ventanatomavacaciones = null;
let ventanapagovacaciones = null;
let ventanaDocumentacion = null;
let ventanavacasadmin = null;
let ventanapagovacasadmin = null;
let ventanapagosporautorizarvacas = null;
let ventanapagosautorizadovacas = null;
let ventanahistorialvacaciones = null;
let ventanahistorialpagosvacas = null;

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
function open_toma_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanatomavacaciones) {
        if (ventanatomavacaciones.isMinimized()) ventanatomavacaciones.restore(); // Restaurar si está minimizada
        ventanatomavacaciones.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanatomavacaciones = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanatomavacaciones.maximize();
    ventanatomavacaciones.loadURL(`file://${__dirname}/Vistas/TomaVacaciones.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanatomavacaciones.on('closed', () => {
        ventanatomavacaciones = null;
    });
}
function open_pago_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanapagovacaciones) {
        if (ventanapagovacaciones.isMinimized()) ventanapagovacaciones.restore(); // Restaurar si está minimizada
        ventanapagovacaciones.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanapagovacaciones = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanapagovacaciones.maximize();
    ventanapagovacaciones.loadURL(`file://${__dirname}/Vistas/PagoVacaciones.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanapagovacaciones.on('closed', () => {
        ventanapagovacaciones = null;
    });
}
function open_doc_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanaDocumentacion) {
        if (ventanaDocumentacion.isMinimized()) ventanaDocumentacion.restore(); // Restaurar si está minimizada
        ventanaDocumentacion.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanaDocumentacion = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanaDocumentacion.maximize();
    ventanaDocumentacion.loadURL(`file://${__dirname}/Vistas/DocumentacionVacas.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanaDocumentacion.on('closed', () => {
        ventanaDocumentacion = null;
    });
}
function open_registro_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanavacasadmin) {
        if (ventanavacasadmin.isMinimized()) ventanavacasadmin.restore(); // Restaurar si está minimizada
        ventanavacasadmin.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanavacasadmin = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanavacasadmin.maximize();
    ventanavacasadmin.loadURL(`file://${__dirname}/Vistas/TomaVacacionesAdmin.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanavacasadmin.on('closed', () => {
        ventanavacasadmin = null;
    });
}
function open_registro_pago_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanapagovacasadmin) {
        if (ventanapagovacasadmin.isMinimized()) ventanapagovacasadmin.restore(); // Restaurar si está minimizada
        ventanapagovacasadmin.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanapagovacasadmin = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanapagovacasadmin.maximize();
    ventanapagovacasadmin.loadURL(`file://${__dirname}/Vistas/PagoVacasAdmin.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanapagovacasadmin.on('closed', () => {
        ventanapagovacasadmin = null;
    });
}
function open_pago_por_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanapagosporautorizarvacas) {
        if (ventanapagosporautorizarvacas.isMinimized()) ventanapagosporautorizarvacas.restore(); // Restaurar si está minimizada
        ventanapagosporautorizarvacas.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanapagosporautorizarvacas = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanapagosporautorizarvacas.maximize();
    ventanapagosporautorizarvacas.loadURL(`file://${__dirname}/Vistas/PagosXAutoVacas.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanapagosporautorizarvacas.on('closed', () => {
        ventanapagosporautorizarvacas = null;
    });
}
function open_pago_autorizados_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanapagosautorizadovacas) {
        if (ventanapagosautorizadovacas.isMinimized()) ventanapagosautorizadovacas.restore(); // Restaurar si está minimizada
        ventanapagosautorizadovacas.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanapagosautorizadovacas = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanapagosautorizadovacas.maximize();
    ventanapagosautorizadovacas.loadURL(`file://${__dirname}/Vistas/PagosVacas.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanapagosautorizadovacas.on('closed', () => {
        ventanapagosautorizadovacas = null;
    });
}
function open_historial_vacaciones() {
    // Verificar si la ventana ya está abierta
    if (ventanahistorialvacaciones) {
        if (ventanahistorialvacaciones.isMinimized()) ventanahistorialvacaciones.restore(); // Restaurar si está minimizada
        ventanahistorialvacaciones.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanahistorialvacaciones = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanahistorialvacaciones.maximize();
    ventanahistorialvacaciones.loadURL(`file://${__dirname}/Vistas/HistorialVacaciones.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanahistorialvacaciones.on('closed', () => {
        ventanahistorialvacaciones = null;
    });
}
function open_historial_pagos_vacas() {
    // Verificar si la ventana ya está abierta
    if (ventanahistorialvacaciones) {
        if (ventanahistorialvacaciones.isMinimized()) ventanahistorialvacaciones.restore(); // Restaurar si está minimizada
        ventanahistorialvacaciones.focus(); // Enfocar si ya está abierta
        return;
    }

    // Crear una nueva ventana
    ventanahistorialvacaciones = new BrowserWindow({
        parent: mainWindow, // Hace que sea ventana hija de Home.html
        modal: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, 'Logo-Recursos.ico'),
        autoHideMenuBar: true
    });
    ventanahistorialvacaciones.maximize();
    ventanahistorialvacaciones.loadURL(`file://${__dirname}/Vistas/HistorialPagos.html`);

    // Manejar el evento de cierre para liberar la referencia
    ventanahistorialvacaciones.on('closed', () => {
        ventanahistorialvacaciones = null;
    });
}
app.on('ready', createWindow);
ipcMain.on('open_adicionales', () => {
    open_Adicionales();
});
ipcMain.on('open_toma_vacaciones', () => {
    open_toma_vacaciones();
});
ipcMain.on('open_pago_vacaciones', () => {
    open_pago_vacaciones();
});
ipcMain.on('open_doc_vacaciones', () => {
    open_doc_vacaciones();
});
ipcMain.on('open_registro_vacaciones', () => {
    open_registro_vacaciones();
});
ipcMain.on('open_registro_pago_vacaciones', () => {
    open_registro_pago_vacaciones();
});
ipcMain.on('open_pago_por_vacaciones', () => {
    open_pago_por_vacaciones();
});
ipcMain.on('open_pago_autorizados_vacaciones', () => {
    open_pago_autorizados_vacaciones();
});
ipcMain.on('open_historial_vacaciones', () => {
    open_historial_vacaciones();
});
ipcMain.on('open_historial_pagos_vacas', () => {
    open_historial_pagos_vacas();
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