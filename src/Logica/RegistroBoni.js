const odbc = require('odbc');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos';
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'Kj8#mP9$vL2@nQ5&xR7*cY4^hN3$mB90'; // 32 bytes
const IV_LENGTH = 16; // Para AES-256-CBC

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text.toString());
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

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

document.getElementById('loadButton').addEventListener('click', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const mesSeleccionado = document.getElementById('mesSelect').value;
    const yearSeleccionado = document.getElementById('yearSelect').value;
    const periodoSeleccionado = `${yearSeleccionado}-${mesSeleccionado}`;
    
    if (!userData) {
        Swal.fire('Error', 'No se encontraron datos del usuario. Por favor, inicie sesión nuevamente.', 'error');
        return;
    }
    if (!mesSeleccionado || !yearSeleccionado) {
        Swal.fire('Error', 'Por favor seleccione un mes y año válidos.', 'error');
        return;
    }
    const loader = Swal.fire({
        title: 'Cargando...',
        text: 'Espere mientras se procesan los datos.',
        icon: 'info',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
    });

    try {
        const connection = await connectionString();
        

        // Primera validación: Verificar si hay una transacción en proceso de auditoría
        const checkAuditoriaQuery = `
            SELECT IdBonificacion 
            FROM Bonificaciones 
            WHERE IdDepartamento = ? 
            AND Mes = ?
            AND Estado IN (1, 2, 3, 4)
            LIMIT 1
        `;
        const pendingAuditoria = await connection.query(checkAuditoriaQuery, [
            userData.Id_Departamento,
            periodoSeleccionado
        ]);

        if (pendingAuditoria && pendingAuditoria.length > 0) {
            await connection.close();
            await Swal.fire({
                title: 'Proceso en Auditoría',
                html: `
                    <p>Existe una transacción finalizada en espera de la confirmación de Auditoría 
                    o verifique si ya fue Autorizada en el mes de ${mesSeleccionado}/${yearSeleccionado}.</p>
                    <p>ID de Bonificación: <strong>${pendingAuditoria[0].IdBonificacion}</strong></p>
                `,
                icon: 'warning'
            });
            return;
        }
        // Consulta para verificar si ya existe un registro
        const checkExistingQuery = `
            SELECT IdBonificacion 
            FROM Bonificaciones 
            WHERE IdUsuario = ? 
            AND Estado = 0 
            AND Mes = ?
            LIMIT 1
        `;

        const existingRecord = await connection.query(checkExistingQuery, [
            userData.Id,
            periodoSeleccionado
        ]);

        let idBonificacion;

        if (existingRecord && existingRecord.length > 0) {
            idBonificacion = existingRecord[0].IdBonificacion;
            
            await Swal.fire({
                title: 'Registro Existente',
                html: `
                    <p>Ya existe un registro de bonificación para el mes ${mesSeleccionado}/${yearSeleccionado}.</p>
                    <p>ID de Bonificación existente: <strong>${idBonificacion}</strong></p>
                `,
                icon: 'warning'
            });
        } else {
            // Si no existe, realizamos la inserción
            const insertBonificacionQuery = `
                INSERT INTO Bonificaciones (
                    IdUsuario, 
                    IdDepartamento, 
                    FechaGenerado, 
                    FechahoraGenerado, 
                    Estado, 
                    Mes
                ) VALUES (?, ?, CURDATE(), NOW(), 0, ?)
            `;

            await connection.query(insertBonificacionQuery, [
                userData.Id,
                userData.Id_Departamento,
                periodoSeleccionado
            ]);

            // Obtener el ID recién insertado
            const getLastIdQuery = `
                SELECT IdBonificacion 
                FROM Bonificaciones 
                WHERE IdUsuario = ? 
                AND IdDepartamento = ? 
                AND Mes = ?
                ORDER BY IdBonificacion DESC 
                LIMIT 1
            `;

            const idResult = await connection.query(getLastIdQuery, [
                userData.Id,
                userData.Id_Departamento,
                periodoSeleccionado
            ]);

            idBonificacion = idResult[0].IdBonificacion;
        }

        // Obtener los colaboradores y sus detalles de bonificación si existen
        const queryColaboradores = `
                                    SELECT 
                                        p.Id AS IdPersonal, 
                                        CONCAT(p.Primer_Nombre, ' ', IFNULL(p.Segundo_Nombre, ''), ' ', 
                                            p.Primer_Apellido, ' ', IFNULL(p.Segundo_Apellido, '')) AS NombreCompleto,
                                        pu.Nombre AS NombrePuesto, 
                                        d.Nombre AS NombreDepartamento,
                                        db.Monto as MontoEncriptado,
                                        db.Observacion
                                    FROM 
                                        personal p
                                        INNER JOIN puestos pu ON p.Id_Puesto = pu.Id_Puesto
                                        INNER JOIN departamentos d ON pu.Id_Departamento = d.Id_Departamento
                                        INNER JOIN planillas pl ON p.Id_Planilla = pl.Id_Planilla
                                        INNER JOIN puestos_general pg ON pu.Id_PuestoGeneral = pg.Id_Puesto
                                        LEFT JOIN DetalleBonificaciones db ON db.IdUsuario = p.Id 
                                            AND db.IdBonificacion = ?
                                    WHERE 
                                        p.Id_Departamento = ? AND 
                                        p.Estado IN (1, 2) AND 
                                        p.Id != ? AND 
                                        pg.Id_Puesto NOT IN (91, 143) AND
                                        p.TipoBonificacion = 0
                                `;

        const colaboradores = await connection.query(queryColaboradores, [
            idBonificacion,
            userData.Id_Departamento,
            userData.Id
        ]);

        await connection.close();

        if (colaboradores.length > 0) {
            // Actualizar la interfaz
            document.getElementById('totalPersonal').textContent = colaboradores.length;
            document.getElementById('idBonificacion').textContent = idBonificacion;
            document.getElementById('finalizarBtn').onclick = () => finalizarRegistro(idBonificacion);
            
            populateCardsWithData(colaboradores, idBonificacion);
            Swal.fire({
                title: 'Proceso Completado',
                html: `
                    <p>ID de Bonificación generado: <strong>${idBonificacion}</strong></p>
                    <p>Cantidad de colaboradores: <strong>${colaboradores.length}</strong></p>
                `,
                icon: 'success'
            });
        } else {
            Swal.fire('Sin resultados', 'No se encontraron colaboradores.', 'info');
        }
    } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', `Se produjo un error: ${error.message}`, 'error');
    }
});

function formatearMes(mesSeleccionado, yearSeleccionado) {
    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${meses[parseInt(mesSeleccionado)]} ${yearSeleccionado}`;
}

function populateCardsWithData(data, idBonificacion) {
    const tableBody = document.getElementById('collaboratorsTableBody');
    tableBody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        
        let montoDesencriptado = '';
        let descuentoAuditoriaDesencriptado = '';
        let descuentoCreditoDesencriptado = '';
        try {
            if (row.MontoEncriptado) {
                montoDesencriptado = decrypt(row.MontoEncriptado);
            }
            if (row.DescuentoAuditoria) {
                descuentoAuditoriaDesencriptado = decrypt(row.DescuentoAuditoria);
            }
            if (row.DescuentoCreditos) {
                descuentoCreditoDesencriptado = decrypt(row.DescuentoCreditos);
            }
        } catch (error) {
            console.error('Error al desencriptar:', error);
            montoDesencriptado = '0';
            descuentoAuditoriaDesencriptado = '0';
            descuentoCreditoDesencriptado = '0';
        }

        const isDisabled = row.MontoEncriptado !== null;
        // Agregar clase si ya está guardado
        if (isDisabled) {
            tr.classList.add('row-saved');
        }
        const initials = row.NombreCompleto.split(' ')
            .map(name => name[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

        tr.innerHTML = `
            <td>
                <div class="collaborator-info">
                    <div class="collaborator-details">
                        <span class="collaborator-name">${row.NombreCompleto}</span>
                        <span class="collaborator-position">${row.NombrePuesto}</span>
                    </div>
                </div>
            </td>
            <td>${row.IdPersonal}</td>
            <td>${row.NombreDepartamento}</td>
            <td class="monto-group">
                <input type="number" 
                    id="montoInicial-${row.IdPersonal}" 
                    class="monto-input"
                    placeholder="0.00" 
                    step="0.01" 
                    min="0"
                    onchange="calcularMontoFinal(${row.IdPersonal})"
                    value="${montoDesencriptado}"
                    ${isDisabled ? 'disabled' : ''} />
            </td>
            <td class="descuento-group">
                <input type="number" 
                    id="descuentoAuditoria-${row.IdPersonal}" 
                    class="monto-input"
                    placeholder="0.00" 
                    step="0.01" 
                    min="0"
                    onchange="manejarCambioDescuento(${row.IdPersonal}, 'auditoria')"
                    value="${descuentoAuditoriaDesencriptado}"
                    ${isDisabled ? 'disabled' : ''} />
                <textarea 
                    id="observacionAuditoria-${row.IdPersonal}" 
                    class="observacion-input hidden"
                    placeholder="No. Documento"
                    rows="2"
                    ${isDisabled ? 'disabled' : ''}>${row.ObservacionAuditoria || ''}</textarea>
            </td>
            <td class="descuento-group">
                <input type="number" 
                    id="descuentoCredito-${row.IdPersonal}" 
                    class="monto-input"
                    placeholder="0.00" 
                    step="0.01" 
                    min="0"
                    onchange="manejarCambioDescuento(${row.IdPersonal}, 'credito')"
                    value="${descuentoCreditoDesencriptado}"
                    ${isDisabled ? 'disabled' : ''} />
                <textarea 
                    id="observacionCredito-${row.IdPersonal}" 
                    class="observacion-input hidden"
                    placeholder="No. Vale"
                    rows="2"
                    ${isDisabled ? 'disabled' : ''}>${row.ObservacionCreditos || ''}</textarea>
            </td>
            <td>
                <div id="montoFinal-${row.IdPersonal}" class="monto-final">
                    Q ${montoDesencriptado}
                </div>
            </td>
            <td>
                <textarea 
                    id="observacion-${row.IdPersonal}" 
                    placeholder="Agregar observación general"
                    rows="2"
                    ${isDisabled ? 'disabled' : ''}>${row.Observacion || ''}</textarea>
            </td>
            <td>
                ${isDisabled ? 
                    `<div class="saved-status">
                        <i class="fas fa-check-circle"></i>
                        <span>Guardado</span>
                    </div>` :
                    `<button class="action-button" 
                        id="btn-${row.IdPersonal}" 
                        onclick="guardarBonificacion(${row.IdPersonal}, ${idBonificacion})">
                        <i class="fas fa-save"></i> Guardar
                    </button>`
                }
            </td>
        `;

        tableBody.appendChild(tr);
        if (!isDisabled) {
            calcularMontoFinal(row.IdPersonal);
        }
    });
}
// Función para calcular el monto final
function calcularMontoFinal(idPersonal) {
    const montoInicial = parseFloat(document.getElementById(`montoInicial-${idPersonal}`).value) || 0;
    const descuentoAuditoria = parseFloat(document.getElementById(`descuentoAuditoria-${idPersonal}`).value) || 0;
    const descuentoCredito = parseFloat(document.getElementById(`descuentoCredito-${idPersonal}`).value) || 0;
    
    const montoFinal = montoInicial - descuentoAuditoria - descuentoCredito;
    document.getElementById(`montoFinal-${idPersonal}`).textContent = `Q ${montoFinal.toFixed(2)}`;
}
// Función para manejar cambios en los descuentos
function manejarCambioDescuento(idPersonal, tipo) {
    const descuentoInput = document.getElementById(`descuento${tipo.charAt(0).toUpperCase() + tipo.slice(1)}-${idPersonal}`);
    const observacionInput = document.getElementById(`observacion${tipo.charAt(0).toUpperCase() + tipo.slice(1)}-${idPersonal}`);
    
    if (descuentoInput.value && parseFloat(descuentoInput.value) > 0) {
        observacionInput.classList.remove('hidden');
        observacionInput.required = true;
    } else {
        observacionInput.classList.add('hidden');
        observacionInput.required = false;
        observacionInput.value = '';
    }
    
    calcularMontoFinal(idPersonal);
}
// Agregamos la función para guardar la bonificación
async function guardarBonificacion(idPersonal, idBonificacion) {
    // Obtener y deshabilitar el botón inmediatamente
    const saveButton = document.getElementById(`btn-${idPersonal}`);
    if (!saveButton || saveButton.disabled) return;

    // Deshabilitar el botón y cambiar su contenido a un spinner
    saveButton.disabled = true;
    const originalContent = saveButton.innerHTML;
    saveButton.innerHTML = '<i class="fas fa-spinner spinner"></i> Guardando...';

    try {
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        if (!userData) {
            throw new Error('No se encontraron datos del usuario. Por favor, inicie sesión nuevamente.');
        }

        // Obtener todos los valores
        const montoInicial = parseFloat(document.getElementById(`montoInicial-${idPersonal}`).value.trim()) || 0;
        const descuentoAuditoria = parseFloat(document.getElementById(`descuentoAuditoria-${idPersonal}`).value.trim()) || 0;
        const descuentoCredito = parseFloat(document.getElementById(`descuentoCredito-${idPersonal}`).value.trim()) || 0;
        const observacionGeneral = document.getElementById(`observacion-${idPersonal}`).value.trim();
        const observacionAuditoria = document.getElementById(`observacionAuditoria-${idPersonal}`).value.trim();
        const observacionCredito = document.getElementById(`observacionCredito-${idPersonal}`).value.trim();

        // Calcular monto final
        const montoFinal = montoInicial - descuentoAuditoria - descuentoCredito;

        // Validaciones
        if (!montoInicial || montoInicial <= 0) {
            throw new Error('Debe ingresar un monto inicial válido');
        }

        if (descuentoAuditoria > 0 && !observacionAuditoria) {
            throw new Error('Debe ingresar el No. de documento en Auditoria');
        }

        if (descuentoCredito > 0 && !observacionCredito) {
            throw new Error('Debe ingresar el No. de Vale');
        }

        if (montoFinal < 0) {
            throw new Error('El monto final no puede ser negativo. Por favor revise los descuentos.');
        }

        const connection = await connectionString();
        
        // Encriptar los montos
        const montoFinalEncriptado = encrypt(montoFinal.toString());
        const montoInicialEncriptado = encrypt(montoInicial.toString());
        const descuentoAuditoriaEncriptado = descuentoAuditoria ? encrypt(descuentoAuditoria.toString()) : null;
        const descuentoCreditoEncriptado = descuentoCredito ? encrypt(descuentoCredito.toString()) : null;

        // Insertar en DetalleBonificaciones
        const insertDetalleQuery = `
            INSERT INTO DetalleBonificaciones (
                IdBonificacion,
                IdUsuario,
                MontoInicial,
                Monto,
                Observacion,
                DescuentoAuditoria,
                ObservacionAuditoria,
                DescuentoCreditos,
                ObservacionCreditos
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(insertDetalleQuery, [
            idBonificacion,
            idPersonal,
            montoInicialEncriptado,
            montoFinalEncriptado,
            observacionGeneral,
            descuentoAuditoriaEncriptado,
            observacionAuditoria,
            descuentoCreditoEncriptado,
            observacionCredito
        ]);

        await connection.close();

        // Deshabilitar todos los inputs
        const elementos = [
            `montoInicial-${idPersonal}`,
            `descuentoAuditoria-${idPersonal}`,
            `descuentoCredito-${idPersonal}`,
            `observacion-${idPersonal}`,
            `observacionAuditoria-${idPersonal}`,
            `observacionCredito-${idPersonal}`
        ];

        elementos.forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.disabled = true;
        });

        // Cambiar el botón a estado guardado
        saveButton.innerHTML = '<i class="fas fa-check-circle"></i> Guardado';
        saveButton.classList.add('saved');
        await Swal.fire({
            title: 'Éxito',
            text: 'Bonificación guardada correctamente',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
        const row = saveButton.closest('tr');
        if (row) {
            row.classList.add('row-saved');
            // Agregar una pequeña animación de fade
            row.style.animation = 'highlightSaved 1s ease';
        }
        actualizarMontoTotal();
    } catch (error) {
        console.error('Error:', error);
        
        // Restaurar el botón a su estado original
        saveButton.disabled = false;
        saveButton.innerHTML = originalContent;

        await Swal.fire({
            title: 'Error',
            text: error.message || 'Se produjo un error al guardar',
            icon: 'error'
        });
    }
}
// Función para calcular y actualizar el total
function actualizarMontoTotal() {
    try {
        // Obtener todas las filas de la tabla
        const filas = document.querySelectorAll('#collaboratorsTableBody tr');
        let total = 0;
        let totalFilas = filas.length;
        let filasGuardadas = 0;

        // Contar filas guardadas y calcular total
        filas.forEach(fila => {
            // Verificar si la fila está guardada
            const tieneClaseGuardada = fila.classList.contains('row-saved');
            if (tieneClaseGuardada) {
                filasGuardadas++;
                // Obtener el monto final de la fila
                const montoElement = fila.querySelector('.monto-final');
                if (montoElement) {
                    const monto = parseFloat(montoElement.textContent.replace('Q', '').trim()) || 0;
                    total += monto;
                }
            }
        });

        // Actualizar el monto total en la interfaz
        const montoTotalElement = document.getElementById('montoTotal');
        if (montoTotalElement) {
            montoTotalElement.textContent = `Q ${total.toFixed(2)}`;
        }

        // Habilitar o deshabilitar el botón finalizar
        const finalizarBtn = document.getElementById('finalizarBtn');
        if (finalizarBtn) {
            const todosGuardados = totalFilas > 0 && filasGuardadas === totalFilas;
            finalizarBtn.disabled = !todosGuardados;

            // Opcionalmente, agregar mensaje visual del progreso
            console.log(`Registros guardados: ${filasGuardadas}/${totalFilas}`);
        }

    } catch (error) {
        console.error('Error al actualizar monto total:', error);
    }
}
 // Función para finalizar el registro
 async function finalizarRegistro(idBonificacion) {
    try {
        const connection = await connectionString();
        const montoTotal = parseFloat(document.getElementById('montoTotal').textContent.replace('Q', '').trim());
        
        const montoTotalEncriptado = encrypt(montoTotal.toString());

        const updateQuery = `
            UPDATE Bonificaciones 
            SET Estado = 1, MontoTotal = ? 
            WHERE IdBonificacion = ?
        `;
        
        await connection.query(updateQuery, [montoTotalEncriptado, idBonificacion]);
        await connection.close();
 
        await Swal.fire({
            title: 'Éxito',
            text: 'Registro finalizado correctamente',
            icon: 'success',
            confirmButtonText: 'OK'
        });
        
        // Limpiar la pantalla de manera segura
        document.getElementById('totalPersonal').textContent = '0';
        document.getElementById('idBonificacion').textContent = '-';
        document.getElementById('montoTotal').textContent = 'Q 0.00';
        
        // Deshabilitar el botón de finalizar
        const finalizarBtn = document.getElementById('finalizarBtn');
        if (finalizarBtn) {
            finalizarBtn.disabled = true;
        }

        // Limpiar la tabla de colaboradores
        const tableBody = document.getElementById('collaboratorsTableBody');
        if (tableBody) {
            tableBody.innerHTML = '';
        }

        // Limpiar los campos de búsqueda
        const searchNombre = document.getElementById('searchNombre');
        const searchPuesto = document.getElementById('searchPuesto');
        if (searchNombre) searchNombre.value = '';
        if (searchPuesto) searchPuesto.value = '';

    } catch(error) {
        console.error('Error al finalizar:', error);
        await Swal.fire({
            title: 'Error',
            text: `Error al finalizar: ${error.message}`,
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}
 // Función para filtrar la tabla
function filterTable() {
    const searchNombre = document.getElementById('searchNombre').value.toLowerCase();
    const searchPuesto = document.getElementById('searchPuesto').value.toLowerCase();
    const rows = document.querySelectorAll('#collaboratorsTableBody tr');

    let visibleCount = 0;

    rows.forEach(row => {
        const nombre = row.querySelector('.collaborator-name').textContent.toLowerCase();
        const puesto = row.querySelector('.collaborator-position').textContent.toLowerCase();
        
        const matchNombre = nombre.includes(searchNombre);
        const matchPuesto = puesto.includes(searchPuesto);

        if (matchNombre && matchPuesto) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Actualizar el contador de personal visible
    document.getElementById('totalPersonal').textContent = visibleCount;
}
document.addEventListener('DOMContentLoaded', () => {
    // Llenar selector de años (5 años atrás hasta el año actual)
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();
    const searchNombre = document.getElementById('searchNombre');
    const searchPuesto = document.getElementById('searchPuesto');

    searchNombre.addEventListener('input', filterTable);
    searchPuesto.addEventListener('input', filterTable);
    
    for (let year = currentYear; year >= currentYear - 1; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }

    // Establecer mes anterior como valor por defecto
    const currentMonth = new Date().getMonth();
    document.getElementById('mesSelect').value = String(currentMonth).padStart(2, '0');
});