const odbc = require('odbc');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos';
const crypto = require('crypto');
const userData = JSON.parse(localStorage.getItem('userData'));
const idencargado = userData.Id;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'Kj8#mP9$vL2@nQ5&xR7*cY4^hN3$mB90';
const IV_LENGTH = 16;

let hasUnsavedChanges = false;
let guardandoConObservacion = false;
async function connectionString() {
    try {
        const connection = await odbc.connect(conexion);
        await connection.query('SET NAMES utf8mb4');
        return connection;
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        throw error;
    }
}
function decrypt(text) {
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Error al desencriptar:', error);
        return '0';
    }
}
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
async function cargarDetalleBonificacion() {
    const urlParams = new URLSearchParams(window.location.search);
    const idBonificacion = urlParams.get('id');
    
    if (!idBonificacion) {
        Swal.fire('Error', 'No se especificó una bonificación', 'error');
        return;
    }

    let connection;
    try {
        connection = await connectionString();
        const query = `
            SELECT
                DetalleBonificaciones.IdUsuario,
                DetalleBonificaciones.Iddetallebonificaciones,
                CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                      personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreColaborador, 
                DetalleBonificaciones.MontoInicial, 
                DetalleBonificaciones.DescuentoAuditoria,
                DetalleBonificaciones.DescuentoCreditos,
                DetalleBonificaciones.Observacion
            FROM Bonificaciones
            INNER JOIN DetalleBonificaciones ON Bonificaciones.IdBonificacion = DetalleBonificaciones.IdBonificacion
            INNER JOIN personal ON DetalleBonificaciones.IdUsuario = personal.Id
            WHERE Bonificaciones.IdBonificacion = ?
        `;
        
        const result = await connection.query(query, [idBonificacion]);
        const tbody = document.getElementById('detalleBody');
        tbody.innerHTML = '';

        result.forEach(row => {
            const montoInicial = parseFloat(decrypt(row.MontoInicial));
            const descAuditoria = parseFloat(decrypt(row.DescuentoAuditoria || encrypt('0')));
            const descCreditos = parseFloat(decrypt(row.DescuentoCreditos || encrypt('0')));
            const montoRecibir = montoInicial - descAuditoria - descCreditos;

            const tr = document.createElement('tr');
            tr.dataset.id = row.IdDetalle;
            tr.dataset.idUsuario = row.IdUsuario;
            tr.dataset.montoOriginal = montoInicial.toString();
            tr.innerHTML = `
                <td>${row.NombreColaborador}</td>
                <td>
                    <div class="monto-container">
                        <span class="monto-original-display">Q${montoInicial.toFixed(2)}</span>
                        <input type="number" class="monto-original-input" style="display:none" value="${montoInicial.toFixed(2)}" step="0.01">
                    </div>
                </td>
                <td>
                    <div class="descuento-container">
                        <span class="descuento-auditoria-display">Q${descAuditoria.toFixed(2)}</span>
                        <input type="number" class="descuento-auditoria-input" style="display:none" value="${descAuditoria.toFixed(2)}" step="0.01">
                    </div>
                </td>
                <td>
                    <div class="descuento-container">
                        <span class="descuento-creditos-display">Q${descCreditos.toFixed(2)}</span>
                        <input type="number" class="descuento-creditos-input" style="display:none" value="${descCreditos.toFixed(2)}" step="0.01">
                    </div>
                </td>
                <td class="monto-recibir">Q${montoRecibir.toFixed(2)}</td>
                <td class="observacion">${row.Observacion || '-'}</td>
                <td>
                    <i class="fas fa-edit edit-icon" onclick="toggleEdicion(this)"></i>
                    <i class="fas fa-save save-icon" onclick="guardarFila(this)" style="display:none"></i>
                </td>
            `;
            tbody.appendChild(tr);
        });

        actualizarTotales();
        document.querySelector('.btn-aprobar').disabled = hasUnsavedChanges;

    } catch (error) {
        console.error('Error al cargar los detalles:', error);
        Swal.fire('Error', 'No se pudieron cargar los detalles de la bonificación', 'error');
    } finally {
        if (connection) await connection.close();
    }
}

async function aprobarBonificacion() {
    if (hasUnsavedChanges) {
        await Swal.fire({
            title: 'Cambios pendientes',
            text: 'Debe guardar los cambios antes de aprobar la bonificación',
            icon: 'warning',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const idBonificacion = urlParams.get('id');
    
    try {
        const result = await Swal.fire({
            title: '¿Aprobar bonificación?',
            text: '¿Está seguro de aprobar esta bonificación?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, aprobar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            const connection = await odbc.connect(conexion);
            
            // Obtener la fecha y hora actual
            const now = new Date();
            const fechaAutorizo = now.toISOString().split('T')[0]; // Formato: YYYY-MM-DD
            const fechaHoraAutorizo = now.toISOString().slice(0, 19).replace('T', ' '); // Formato: YYYY-MM-DD HH:MM:SS
            
            // Actualizar el estado y agregar la información de autorización
            const query = `
                UPDATE Bonificaciones 
                SET Estado = 3,
                    IdAutorizo = ?,
                    FechaAutorizo = ?,
                    FechaHoraAutorizo = ?
                WHERE IdBonificacion = ?
            `;
            
            await connection.query(query, [
                idencargado,
                fechaAutorizo,
                fechaHoraAutorizo,
                idBonificacion
            ]);
            
            await connection.close();
            
            await Swal.fire({
                title: '¡Éxito!',
                text: 'Bonificación aprobada correctamente',
                icon: 'success',
                confirmButtonText: 'OK'
            });
            
            // Redireccionar después de que el usuario cierre el mensaje de éxito
            window.location.href = 'AutorizacionBoni.html';
        }
    } catch (error) {
        console.error('Error al aprobar:', error);
        await Swal.fire('Error', 'No se pudo aprobar la bonificación', 'error');
    }
}

async function rechazarBonificacion() {
    const urlParams = new URLSearchParams(window.location.search);
    const idBonificacion = urlParams.get('id');
    
    try {
        const result = await Swal.fire({
            title: '¿Rechazar bonificación?',
            text: '¿Está seguro de rechazar esta bonificación?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, rechazar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            const connection = await odbc.connect(conexion);
            await connection.query('UPDATE Bonificaciones SET Estado = 3 WHERE IdBonificacion = ?', [idBonificacion]);
            await connection.close();
            
            await Swal.fire('¡Éxito!', 'Bonificación rechazada correctamente', 'success');
            window.location.href = 'AutorizacionBoni.html';
        }
    } catch (error) {
        console.error('Error al rechazar:', error);
        Swal.fire('Error', 'No se pudo rechazar la bonificación', 'error');
    }
}
//parte para la modificacion 
function toggleEdicion(icon) {
    const row = icon.closest('tr');
    const montoOriginalDisplay = row.querySelector('.monto-original-display');
    const montoOriginalInput = row.querySelector('.monto-original-input');
    const descAuditoriaDisplay = row.querySelector('.descuento-auditoria-display');
    const descAuditoriaInput = row.querySelector('.descuento-auditoria-input');
    const descCreditosDisplay = row.querySelector('.descuento-creditos-display');
    const descCreditosInput = row.querySelector('.descuento-creditos-input');
    const editIcon = row.querySelector('.edit-icon');
    const saveIcon = row.querySelector('.save-icon');

    // Guardar valores originales para comparar cambios
    row.dataset.originalMontoOriginal = montoOriginalDisplay.textContent.replace('Q', '');
    row.dataset.originalDescAuditoria = descAuditoriaDisplay.textContent.replace('Q', '');
    row.dataset.originalDescCreditos = descCreditosDisplay.textContent.replace('Q', '');

    // Mostrar inputs y ocultar displays
    montoOriginalDisplay.style.display = 'none';
    montoOriginalInput.style.display = 'block';
    descAuditoriaDisplay.style.display = 'none';
    descAuditoriaInput.style.display = 'block';
    descCreditosDisplay.style.display = 'none';
    descCreditosInput.style.display = 'block';
    editIcon.style.display = 'none';
    saveIcon.style.display = 'inline';
    
    hasUnsavedChanges = true;
    actualizarEstadoBotonAprobar();
}

async function guardarCambios() {
    const urlParams = new URLSearchParams(window.location.search);
    const idBonificacion = urlParams.get('id');
    let connection;

    try {
        connection = await connectionString();
        const rows = document.querySelectorAll('#detalleBody tr');
        let montoTotalFinal = 0;
        const now = new Date();
        const fechaCambio = now.toISOString().split('T')[0];
        const fechaHoraCambio = now.toISOString().slice(0, 19).replace('T', ' ');
        
        // Primero calculamos el monto total final
        rows.forEach(row => {
            const montoRecibir = parseFloat(row.querySelector('.monto-recibir').textContent.replace('Q', ''));
            montoTotalFinal += montoRecibir;
        });

        // Actualizamos la tabla Bonificaciones con el nuevo monto total
        const montoTotalEncriptado = encrypt(montoTotalFinal.toString());
        await connection.query(
            'UPDATE Bonificaciones SET MontoTotal = ? WHERE IdBonificacion = ?',
            [montoTotalEncriptado, idBonificacion]
        );
        
        // Ahora procesamos cada detalle
        for (const row of rows) {
            const idUsuario = row.dataset.idUsuario;
            
            // Obtener valores actuales
            const montoOriginalNuevo = parseFloat(row.querySelector('.monto-original-display').textContent.replace('Q', ''));
            const descAuditoriaNuevo = parseFloat(row.querySelector('.descuento-auditoria-display').textContent.replace('Q', ''));
            const descCreditosNuevo = parseFloat(row.querySelector('.descuento-creditos-display').textContent.replace('Q', ''));
            const montoRecibirNuevo = parseFloat(row.querySelector('.monto-recibir').textContent.replace('Q', ''));
            
            // Obtener valores originales
            const montoOriginalAnterior = parseFloat(row.dataset.originalMontoOriginal || '0');
            const descAuditoriaAnterior = parseFloat(row.dataset.originalDescAuditoria || '0');
            const descCreditosAnterior = parseFloat(row.dataset.originalDescCreditos || '0');
            const montoRecibirAnterior = montoOriginalAnterior - descAuditoriaAnterior - descCreditosAnterior;

            // Verificar si hubo cambios
            const cambioMontoOriginal = montoOriginalNuevo !== montoOriginalAnterior;
            const cambioDescAuditoria = descAuditoriaNuevo !== descAuditoriaAnterior;
            const cambioDescCreditos = descCreditosNuevo !== descCreditosAnterior;
            const cambioMontoRecibir = montoRecibirNuevo !== montoRecibirAnterior;

            // Solo actualizar si hubo algún cambio
            if (cambioMontoOriginal || cambioDescAuditoria || cambioDescCreditos) {
                await connection.query(
                    `UPDATE DetalleBonificaciones 
                     SET MontoInicial = ?, 
                         DescuentoAuditoria = ?,
                         DescuentoCreditos = ?
                     WHERE IdBonificacion = ? AND IdUsuario = ?`,
                    [
                        encrypt(montoOriginalNuevo.toString()),
                        encrypt(descAuditoriaNuevo.toString()),
                        encrypt(descCreditosNuevo.toString()),
                        idBonificacion,
                        idUsuario
                    ]
                );

                // Registrar cambios en HistorialBonificaciones
                // Cambio en MontoInicial (TipoCambio = 1)
                if (cambioMontoOriginal) {
                    await connection.query(`
                        INSERT INTO HistorialBonificaciones 
                        (IdPersonal, FechaCambio, FechaHoraCambio, ValorAnterior, ValorNuevo, 
                         IdPersonaModifico, IdBonificacion, TipoCambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        idUsuario,
                        fechaCambio,
                        fechaHoraCambio,
                        encrypt(montoOriginalAnterior.toString()),
                        encrypt(montoOriginalNuevo.toString()),
                        idencargado,
                        idBonificacion,
                        '1'
                    ]);
                }

                // Cambio en Monto a Recibir (TipoCambio = 2)
                if (cambioMontoRecibir) {
                    await connection.query(`
                        INSERT INTO HistorialBonificaciones 
                        (IdPersonal, FechaCambio, FechaHoraCambio, ValorAnterior, ValorNuevo, 
                         IdPersonaModifico, IdBonificacion, TipoCambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        idUsuario,
                        fechaCambio,
                        fechaHoraCambio,
                        encrypt(montoRecibirAnterior.toString()),
                        encrypt(montoRecibirNuevo.toString()),
                        idencargado,
                        idBonificacion,
                        '2'
                    ]);
                }

                // Cambio en DescuentoAuditoria (TipoCambio = 3)
                if (cambioDescAuditoria) {
                    await connection.query(`
                        INSERT INTO HistorialBonificaciones 
                        (IdPersonal, FechaCambio, FechaHoraCambio, ValorAnterior, ValorNuevo, 
                         IdPersonaModifico, IdBonificacion, TipoCambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        idUsuario,
                        fechaCambio,
                        fechaHoraCambio,
                        encrypt(descAuditoriaAnterior.toString()),
                        encrypt(descAuditoriaNuevo.toString()),
                        idencargado,
                        idBonificacion,
                        '3'
                    ]);
                }

                // Cambio en DescuentoCreditos (TipoCambio = 4)
                if (cambioDescCreditos) {
                    await connection.query(`
                        INSERT INTO HistorialBonificaciones 
                        (IdPersonal, FechaCambio, FechaHoraCambio, ValorAnterior, ValorNuevo, 
                         IdPersonaModifico, IdBonificacion, TipoCambio)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        idUsuario,
                        fechaCambio,
                        fechaHoraCambio,
                        encrypt(descCreditosAnterior.toString()),
                        encrypt(descCreditosNuevo.toString()),
                        idencargado,
                        idBonificacion,
                        '4'
                    ]);
                }
            }
        }

        hasUnsavedChanges = false;
        actualizarEstadoBotonAprobar();
        await Swal.fire('¡Éxito!', 'Cambios guardados correctamente', 'success');

    } catch (error) {
        console.error('Error al guardar cambios:', error);
        await Swal.fire({
            title: 'Error',
            text: `No se pudieron guardar los cambios: ${error.message}`,
            icon: 'error'
        });
    } finally {
        if (connection) await connection.close();
    }
}

function calcularMontoRecibir(montoOriginal, descAuditoria, descCreditos) {
    return montoOriginal - descAuditoria - descCreditos;
}

function actualizarTotales() {
    let montoTotal = 0;
    let descuentoAuditoriaTotal = 0;
    let descuentoCreditosTotal = 0;
    const rows = document.querySelectorAll('#detalleBody tr');
    let totalColaboradores = rows.length;
    
    rows.forEach(row => {
        const montoRecibir = parseFloat(row.querySelector('.monto-recibir').textContent.replace('Q', ''));
        const descAuditoria = parseFloat(row.querySelector('.descuento-auditoria-display').textContent.replace('Q', ''));
        const descCreditos = parseFloat(row.querySelector('.descuento-creditos-display').textContent.replace('Q', ''));
        
        montoTotal += montoRecibir;
        descuentoAuditoriaTotal += descAuditoria;
        descuentoCreditosTotal += descCreditos;
    });

    document.getElementById('montoTotal').textContent = `Q${montoTotal.toFixed(2)}`;
    document.getElementById('totalDescuentos').textContent = `Q${(descuentoAuditoriaTotal + descuentoCreditosTotal).toFixed(2)}`;
    document.getElementById('totalColaboradores').textContent = totalColaboradores;
}

async function guardarFila(icon) {
    const overlay = document.querySelector('.save-overlay');
    const spinner = overlay.querySelector('.spinner');
    const checkMark = overlay.querySelector('.check-mark');
    const saveText = overlay.querySelector('.save-text');
    
    const row = icon.closest('tr');
    const idUsuario = row.dataset.idUsuario;
    const urlParams = new URLSearchParams(window.location.search);
    const idBonificacion = urlParams.get('id');
    let connection;

    try {
        // Mostrar overlay con spinner
        overlay.style.display = 'flex';
        spinner.style.display = 'block';
        checkMark.style.display = 'none';
        saveText.textContent = 'Guardando cambios...';

        // Obtener valores nuevos
        const montoOriginalNuevo = parseFloat(row.querySelector('.monto-original-input').value);
        const descAuditoriaNuevo = parseFloat(row.querySelector('.descuento-auditoria-input').value);
        const descCreditosNuevo = parseFloat(row.querySelector('.descuento-creditos-input').value);
        const montoRecibirNuevo = montoOriginalNuevo - descAuditoriaNuevo - descCreditosNuevo;

        // Obtener valores anteriores del dataset
        const montoOriginalAnterior = parseFloat(row.dataset.originalMontoOriginal);
        const descAuditoriaAnterior = parseFloat(row.dataset.originalDescAuditoria);
        const descCreditosAnterior = parseFloat(row.dataset.originalDescCreditos);
        const montoRecibirAnterior = montoOriginalAnterior - descAuditoriaAnterior - descCreditosAnterior;

        // Verificar si hubo cambios
        const cambioMontoOriginal = montoOriginalNuevo !== montoOriginalAnterior;
        const cambioDescAuditoria = descAuditoriaNuevo !== descAuditoriaAnterior;
        const cambioDescCreditos = descCreditosNuevo !== descCreditosAnterior;
        const cambioMontoRecibir = montoRecibirNuevo !== montoRecibirAnterior;

        if (cambioMontoOriginal || cambioDescAuditoria || cambioDescCreditos) {
            connection = await connectionString();

            // Obtener la fecha y hora del servidor
            const [{ fecha, fechaHora }] = await connection.query(`
                SELECT 
                    DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') as fecha,
                    DATE_FORMAT(CURRENT_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') as fechaHora
            `);

            // Actualizar DetalleBonificaciones
            await connection.query(
                `UPDATE DetalleBonificaciones 
                 SET MontoInicial = ?,
                     DescuentoAuditoria = ?,
                     DescuentoCreditos = ?,
                     Monto = ?
                 WHERE IdBonificacion = ? AND IdUsuario = ?`,
                [
                    encrypt(montoOriginalNuevo.toString()),
                    encrypt(descAuditoriaNuevo.toString()),
                    encrypt(descCreditosNuevo.toString()),
                    encrypt(montoRecibirNuevo.toString()),
                    idBonificacion,
                    idUsuario
                ]
            );

            // Registrar cambios en HistorialBonificaciones
            const registrarHistorial = async (valorAnterior, valorNuevo, tipoCambio) => {
                await connection.query(`
                    INSERT INTO HistorialBonificaciones 
                    (IdPersonal, FechaCambio, FechaHoraCambio, ValorAnterior, ValorNuevo, 
                     IdPersonaModifico, IdBonificacion, TipoCambio)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    idUsuario,
                    fecha,
                    fechaHora,
                    encrypt(valorAnterior.toString()),
                    encrypt(valorNuevo.toString()),
                    idencargado,
                    idBonificacion,
                    tipoCambio
                ]);
            };

            // Registrar los diferentes tipos de cambios
            if (cambioMontoOriginal) {
                await registrarHistorial(montoOriginalAnterior, montoOriginalNuevo, '1');
            }
            if (cambioMontoRecibir) {
                await registrarHistorial(montoRecibirAnterior, montoRecibirNuevo, '2');
            }
            if (cambioDescAuditoria) {
                await registrarHistorial(descAuditoriaAnterior, descAuditoriaNuevo, '3');
            }
            if (cambioDescCreditos) {
                await registrarHistorial(descCreditosAnterior, descCreditosNuevo, '4');
            }

            // Actualizar el monto total en la tabla Bonificaciones
            let montoTotal = 0;
            document.querySelectorAll('#detalleBody tr').forEach(fila => {
                const montoRecibirFila = parseFloat(fila.querySelector('.monto-recibir').textContent.replace('Q', ''));
                montoTotal += montoRecibirFila;
            });

            await connection.query(
                'UPDATE Bonificaciones SET MontoTotal = ? WHERE IdBonificacion = ?',
                [encrypt(montoTotal.toString()), idBonificacion]
            );

            // Actualizar la interfaz
            actualizarDisplaysYEstados(row, montoOriginalNuevo, descAuditoriaNuevo, descCreditosNuevo, montoRecibirNuevo);
            actualizarTotales();

            // Cambiar a checkmark
            spinner.style.display = 'none';
            checkMark.style.display = 'block';
            saveText.textContent = '¡Cambios guardados!';

            // Esperar un momento y cerrar el overlay
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

    } catch (error) {
        console.error('Error al guardar:', error);
        saveText.textContent = 'Error al guardar cambios';
        spinner.style.display = 'none';
        await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
        if (connection) await connection.close();
        overlay.style.display = 'none';
    }
}
function actualizarDisplaysYEstados(row, montoOriginal, descAuditoria, descCreditos, montoRecibir) {
    const montoOriginalDisplay = row.querySelector('.monto-original-display');
    const descAuditoriaDisplay = row.querySelector('.descuento-auditoria-display');
    const descCreditosDisplay = row.querySelector('.descuento-creditos-display');
    const montoRecibirCell = row.querySelector('.monto-recibir');
    const montoOriginalInput = row.querySelector('.monto-original-input');
    const descAuditoriaInput = row.querySelector('.descuento-auditoria-input');
    const descCreditosInput = row.querySelector('.descuento-creditos-input');

    // Actualizar los displays
    montoOriginalDisplay.textContent = `Q${montoOriginal.toFixed(2)}`;
    descAuditoriaDisplay.textContent = `Q${descAuditoria.toFixed(2)}`;
    descCreditosDisplay.textContent = `Q${descCreditos.toFixed(2)}`;
    montoRecibirCell.textContent = `Q${montoRecibir.toFixed(2)}`;
    
    // Cambiar visibilidad
    montoOriginalDisplay.style.display = 'block';
    montoOriginalInput.style.display = 'none';
    descAuditoriaDisplay.style.display = 'block';
    descAuditoriaInput.style.display = 'none';
    descCreditosDisplay.style.display = 'block';
    descCreditosInput.style.display = 'none';
    row.querySelector('.edit-icon').style.display = 'inline';
    row.querySelector('.save-icon').style.display = 'none';

    // Actualizar totales
    actualizarTotales();
    
    // Marcar que hay cambios sin guardar
    hasUnsavedChanges = true;
    document.querySelector('.btn-aprobar').disabled = true;
}
async function mostrarModalDescuento(row, descuento) {
    const observacionActual = row.querySelector('.observacion-descuento')?.textContent || '';
    
    const result = await Swal.fire({
        title: 'Motivo del Descuento',
        html: `
            <div class="modal-body">
                <p>Monto del descuento: Q${descuento.toFixed(2)}</p>
                <textarea 
                    id="motivoDescuento" 
                    class="swal2-textarea" 
                    placeholder="Ingrese el motivo del descuento"
                    style="height: 100px;"
                >${observacionActual}</textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const motivo = document.getElementById('motivoDescuento').value;
            if (!motivo.trim()) {
                Swal.showValidationMessage('Debe ingresar un motivo para el descuento');
                return false;
            }
            return motivo;
        }
    });

    return result;
}
// Función para actualizar el estado del botón aprobar
function actualizarEstadoBotonAprobar() {
    const btnAprobar = document.querySelector('.btn-aprobar');
    btnAprobar.disabled = hasUnsavedChanges;
    
    // Actualizar estilo visual del botón
    if (hasUnsavedChanges) {
        btnAprobar.style.opacity = '0.5';
        btnAprobar.style.cursor = 'not-allowed';
    } else {
        btnAprobar.style.opacity = '1';
        btnAprobar.style.cursor = 'pointer';
    }
}
document.addEventListener('DOMContentLoaded', () => {
    cargarDetalleBonificacion();
    document.querySelector('.btn-aprobar').disabled = hasUnsavedChanges;
});