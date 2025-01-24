const odbc = require('odbc');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos';
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'Kj8#mP9$vL2@nQ5&xR7*cY4^hN3$mB90'; // 32 bytes
const IV_LENGTH = 16; // Para AES-256-CBC
let currentSort = {
    column: null,
    direction: 'asc'
};
function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text.toString());
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    try {
        if (!text) return '0';
        const textParts = text.split(':');
        if (textParts.length < 2) return '0';
        
        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Error decrypting:', error);
        return '0';
    }
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
                    <p>Existe una transacción finalizada en el mes de ${mesSeleccionado}/${yearSeleccionado}.</p>
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
            currentBonificacionId = idBonificacion;
        }

        // Obtener los colaboradores y sus detalles de bonificación si existen
        const queryColaboradores = `
                                    SELECT 
                                        p.Id AS IdPersonal, 
                                        CONCAT(p.Primer_Nombre, ' ', IFNULL(p.Segundo_Nombre, ''), ' ', 
                                            p.Primer_Apellido, ' ', IFNULL(p.Segundo_Apellido, '')) AS NombreCompleto,
                                        pu.Nombre AS NombrePuesto, 
                                        d.Nombre AS NombreDepartamento,
                                        db.MontoInicial as MontoEncriptado,  -- Monto Inicial encriptado
                                        db.Monto as MontoFinalEncriptado,    -- Monto Final encriptado
                                        db.DescuentoAuditoria,
                                        db.ObservacionAuditoria,
                                        db.DescuentoCreditos,
                                        db.ObservacionCreditos,
                                        db.Observacion
                                    FROM personal p
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
        actualizarMontoTotal();
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
    return `${meses[parseInt(mesSeleccionado) - 1]} ${yearSeleccionado}`;
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
        if (isDisabled) {
            tr.classList.add('row-saved');
        }

        tr.innerHTML = `
            <td>${row.NombreCompleto}</td>
            <td>${row.NombrePuesto}</td>
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
                    Q ${calcularMontoFinalValue(montoDesencriptado, descuentoAuditoriaDesencriptado, descuentoCreditoDesencriptado)}
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
        document.querySelectorAll('th.sortable').forEach(header => {
            header.addEventListener('click', () => {
                const column = header.getAttribute('data-sort');
                sortTable(column);
            });
        });
    });
}
function calcularMontoFinalValue(montoInicial, descuentoAuditoria, descuentoCredito) {
    const inicial = parseFloat(montoInicial) || 0;
    const descAuditoria = parseFloat(descuentoAuditoria) || 0;
    const descCredito = parseFloat(descuentoCredito) || 0;
    return (inicial - descAuditoria - descCredito).toFixed(2);
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
        const filas = document.querySelectorAll('#collaboratorsTableBody tr');
        let total = 0;

        filas.forEach(fila => {
            if (fila.classList.contains('row-saved')) {
                const montoElement = fila.querySelector('.monto-final');
                if (montoElement) {
                    const monto = parseFloat(montoElement.textContent.replace('Q', '').trim()) || 0;
                    total += monto;
                }
            }
        });

        const montoTotalElement = document.getElementById('montoTotal');
        if (montoTotalElement) {
            montoTotalElement.textContent = `Q ${total.toFixed(2)}`;
        }

    } catch (error) {
        console.error('Error al actualizar monto total:', error);
    }
}
 // Función para finalizar el registro
 async function finalizarRegistro(idBonificacion) {
    currentBonificacionId = idBonificacion;
    try {
        const filas = document.querySelectorAll('#collaboratorsTableBody tr');
        const totalColaboradores = filas.length;
        const colaboradoresRegistrados = document.querySelectorAll('.row-saved').length;
        const colaboradoresFaltantes = totalColaboradores - colaboradoresRegistrados;

        const result = await Swal.fire({
            title: '¿Está seguro de finalizar el registro?',
            html: `
                <p>Total de colaboradores: <strong>${totalColaboradores}</strong></p>
                <p>Colaboradores registrados: <strong>${colaboradoresRegistrados}</strong></p>
                <p>Colaboradores pendientes: <strong>${colaboradoresFaltantes}</strong></p>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, finalizar',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            const connection = await connectionString();
            const montoTotal = parseFloat(document.getElementById('montoTotal').textContent.replace('Q', '').trim());
            const montoTotalEncriptado = encrypt(montoTotal.toString());

            await connection.query(
                'UPDATE Bonificaciones SET Estado = 1, MontoTotal = ? WHERE IdBonificacion = ?', 
                [montoTotalEncriptado, idBonificacion]
            );
            await connection.close();

            currentBonificacionId = idBonificacion;
            await generarPDF();

            document.getElementById('totalPersonal').textContent = '0';
            document.getElementById('idBonificacion').textContent = '-';
            document.getElementById('montoTotal').textContent = 'Q 0.00';
            document.getElementById('collaboratorsTableBody').innerHTML = '';

            document.getElementById('finalizarBtn').style.display = 'none';
            
            const container = document.querySelector('.info-summary');
            const finalizarEntregaBtn = document.createElement('button');
            finalizarEntregaBtn.className = 'btn-finalizar-entrega';
            finalizarEntregaBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Finalizar Entrega';
            finalizarEntregaBtn.onclick = () => generarPDFResumen(idBonificacion);
            container.appendChild(finalizarEntregaBtn);
        }
    } catch(error) {
        console.error('Error:', error);
        await Swal.fire({
            icon: 'error',
            text: `Error al finalizar: ${error.message}`
        });
    }
}
async function generarPDF() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    try {
        const { jsPDF } = window.jspdf;
        const userData = JSON.parse(localStorage.getItem('userData'));
        const idBonificacion = document.getElementById('idBonificacion').textContent;
        const connection = await connectionString();

        const bonificacionQuery = `
            SELECT B.*, D.Nombre as Departamento, B.Mes
            FROM Bonificaciones B
            INNER JOIN departamentos D ON B.IdDepartamento = D.Id_Departamento
            WHERE B.IdBonificacion = ?
        `;
        const bonificacionInfo = await connection.query(bonificacionQuery, [idBonificacion]);
        
        if (!bonificacionInfo || !bonificacionInfo.length) {
            throw new Error('No se encontró la información de la bonificación');
        }

        const departamento = bonificacionInfo[0].Departamento;
        const mesBonificacion = formatearMes(
            bonificacionInfo[0].Mes.split('-')[1], 
            bonificacionInfo[0].Mes.split('-')[0]
        );
        // Consulta SQL
        const query = `
            SELECT
                CONCAT(personal.Primer_Nombre, ' ', 
                      IFNULL(personal.Segundo_Nombre, ''), ' ', 
                      personal.Primer_Apellido, ' ', 
                      IFNULL(personal.Segundo_Apellido, '')) AS NombreColaborador,
                DetalleBonificaciones.Monto,
                DetalleBonificaciones.MontoInicial,
                DetalleBonificaciones.DescuentoAuditoria,
                DetalleBonificaciones.DescuentoCreditos,
                DetalleBonificaciones.ObservacionAuditoria,
                DetalleBonificaciones.ObservacionCreditos,
                DetalleBonificaciones.IdUsuario
            FROM Bonificaciones
            INNER JOIN DetalleBonificaciones 
                ON Bonificaciones.IdBonificacion = DetalleBonificaciones.IdBonificacion
            INNER JOIN personal 
                ON DetalleBonificaciones.IdUsuario = personal.Id
            WHERE DetalleBonificaciones.IdBonificacion = ?
        `;

        const personal = await connection.query(query, [currentBonificacionId]);

        // Configurar el PDF
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });

        // Función para mostrar monto con línea punteada
        function drawAmountWithDots(pdf, label, amount, x, y, width) {
            const dotStartX = x + 50; // Posición donde empiezan los puntos
            const amountText = `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`;
            
            pdf.text(label, x + 4, y);
            pdf.text(amountText, x + width - 4, y, { align: 'right' });
        }

        // Ajustar dimensiones para 6 boletas pegadas
        const marginX = 10;
        const marginY = 10;
        const boletaWidth = 98;
        const boletaHeight = 86;
        const columnas = 2;
        const filas = 3;
        const espacioX = 0;
        const espacioY = 0;

        let currentPage = 0;
        const boletasPorPagina = columnas * filas;

        for (let i = 0; i < personal.length; i++) {
            const persona = personal[i];

            const posicionEnPagina = i % boletasPorPagina;
            const columna = posicionEnPagina % columnas;
            const fila = Math.floor(posicionEnPagina / columnas);

            if (posicionEnPagina === 0 && i > 0) {
                pdf.addPage();
                currentPage++;
            }

            const x = marginX + columna * (boletaWidth + espacioX);
            const y = marginY + fila * (boletaHeight + espacioY);

            // Obtener datos y desencriptar montos
            const puesto = await obtenerPuestoEmpleado(persona.IdUsuario);
            const montoInicialDecrypt = parseFloat(decrypt(persona.MontoInicial || '0'));
            const descuentoAuditoriaDecrypt = parseFloat(decrypt(persona.DescuentoAuditoria || '0'));
            const descuentoCreditosDecrypt = parseFloat(decrypt(persona.DescuentoCreditos || '0'));
            const montoFinalDecrypt = parseFloat(decrypt(persona.Monto || '0'));

            // Dibujar boleta
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(x, y, boletaWidth, boletaHeight);
            pdf.setFillColor(240, 240, 240);
            pdf.rect(x, y, boletaWidth, 8, 'F');

            // Título
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.text('BOLETA DE BONIFICACIÓN', x + boletaWidth/2, y + 5, { align: 'center' });

            // Información principal
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            let currentY = y + 12;
            const lineHeight = 4.5;

            // Información básica
            pdf.text(`Departamento: ${departamento}`, x + 4, currentY);
            currentY += lineHeight;
            pdf.text(`Puesto: ${puesto}`, x + 4, currentY);
            currentY += lineHeight;
            pdf.text(`Colaborador: ${persona.NombreColaborador}`, x + 4, currentY);
            currentY += lineHeight;
            pdf.text(`Mes: ${mesBonificacion}`, x + 4, currentY);
            currentY += lineHeight * 1.5;

            // Desglose de montos con líneas punteadas
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            drawAmountWithDots(pdf, 'Monto Inicial:', montoInicialDecrypt, x, currentY, boletaWidth);
            currentY += lineHeight;

            pdf.setFont('helvetica', 'normal');
            if (descuentoAuditoriaDecrypt > 0) {
                drawAmountWithDots(pdf, '(-) Descuento Auditoría:', descuentoAuditoriaDecrypt, x, currentY, boletaWidth);
                currentY += lineHeight;

                if (persona.ObservacionAuditoria) {
                    pdf.setFontSize(7);
                    const observacionLines = pdf.splitTextToSize(
                        `Nota: ${persona.ObservacionAuditoria}`, 
                        boletaWidth - 10
                    );
                    observacionLines.forEach(line => {
                        pdf.text(line, x + 4, currentY);
                        currentY += 3;
                    });
                    pdf.setFontSize(8.5);
                }
            }

            if (descuentoCreditosDecrypt > 0) {
                drawAmountWithDots(pdf, '(-) Descuento Créditos:', descuentoCreditosDecrypt, x, currentY, boletaWidth);
                currentY += lineHeight;

                if (persona.ObservacionCreditos) {
                    pdf.setFontSize(7);
                    const observacionLines = pdf.splitTextToSize(
                        `No. Vale: ${persona.ObservacionCreditos}`, 
                        boletaWidth - 10
                    );
                    observacionLines.forEach(line => {
                        pdf.text(line, x + 4, currentY);
                        currentY += 3;
                    });
                    pdf.setFontSize(8.5);
                }
            }

            currentY += lineHeight/2;

            // Monto Final
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            drawAmountWithDots(pdf, 'TOTAL A RECIBIR:', montoFinalDecrypt, x, currentY, boletaWidth);

            // Sección de firmas
            const firmaY1 = y + boletaHeight - 18; // Posición Y para las firmas superiores
            const firmaY2 = y + boletaHeight - 8;  // Posición Y para la firma inferior
            const firmaWidth = (boletaWidth - 12) / 2; // Ancho para las firmas superiores

            pdf.setFontSize(6.5);

            // Primera firma superior (izquierda) - Colaborador
            pdf.line(x + 4, firmaY1, x + firmaWidth - 1, firmaY1);
            pdf.text('Firma Colaborador', x + 4, firmaY1 + 2);
            
            // Segunda firma superior (derecha) - Jefe de Área
            pdf.line(x + firmaWidth + 5, firmaY1, x + boletaWidth - 4, firmaY1);
            pdf.text('Firma Jefe de Área', x + firmaWidth + 5, firmaY1 + 2);

            // Tercera firma (centro abajo) - Encargado
            const firmaInferiorWidth = boletaWidth * 0.6;
            const firmaInferiorX = x + (boletaWidth - firmaInferiorWidth) / 2;
            pdf.line(firmaInferiorX, firmaY2, firmaInferiorX + firmaInferiorWidth, firmaY2);
            pdf.text('Firma Encargado', firmaInferiorX + (firmaInferiorWidth/2) - 10, firmaY2 + 2);
            pdf.text('Fecha recibido: ____/____/______', firmaInferiorX + (firmaInferiorWidth/2) - 20, firmaY2 + 6);
            // Marcas de corte
            const longitudCorte = 3;
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineWidth(0.1);

            // Esquina superior izquierda
            pdf.line(x, y, x + longitudCorte, y);
            pdf.line(x, y, x, y + longitudCorte);

            // Esquina superior derecha
            pdf.line(x + boletaWidth - longitudCorte, y, x + boletaWidth, y);
            pdf.line(x + boletaWidth, y, x + boletaWidth, y + longitudCorte);

            // Esquina inferior izquierda
            pdf.line(x, y + boletaHeight, x + longitudCorte, y + boletaHeight);
            pdf.line(x, y + boletaHeight - longitudCorte, x, y + boletaHeight);

            // Esquina inferior derecha
            pdf.line(x + boletaWidth - longitudCorte, y + boletaHeight, x + boletaWidth, y + boletaHeight);
            pdf.line(x + boletaWidth, y + boletaHeight - longitudCorte, x + boletaWidth, y + boletaHeight);
        }

        // Guardar el PDF
        pdf.save(`Boletas_Bonificacion_${departamento}_${mesBonificacion}.pdf`);
        document.getElementById('loadingSpinner').style.display = 'none';
        await Swal.fire({
            icon: 'success',
            title: 'PDF Generado',
            text: 'Las boletas han sido generadas exitosamente'
        });

    } catch (error) {
        console.error('Error al generar PDF:', error);
        document.getElementById('loadingSpinner').style.display = 'none';
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: `No se pudieron generar las boletas: ${error.message}`
        });
    }
}
async function obtenerPuestoEmpleado(idUsuario) {
    try {
        const connection = await connectionString();
        const query = `
            SELECT 
                puestos.Nombre
            FROM personal
            INNER JOIN puestos ON personal.Id_Puesto = puestos.Id_Puesto
            WHERE personal.Id = ?
        `;
        
        const result = await connection.query(query, [idUsuario]);
        await connection.close();
        
        return result[0]?.Nombre || 'No especificado';
    } catch (error) {
        console.error('Error al obtener puesto:', error);
        return 'No especificado';
    }
}
async function generarPDFResumen(idBonificacion) {
    try {
        const { jsPDF } = window.jspdf;
        const connection = await connectionString();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        const query = `
            SELECT 
                B.IdBonificacion,
                B.MontoTotal,
                B.Mes,
                D.Nombre as Departamento,
                B.FechahoraGenerado
            FROM Bonificaciones B
            INNER JOIN departamentos D ON B.IdDepartamento = D.Id_Departamento
            WHERE B.IdBonificacion = ?
        `;
        
        const result = await connection.query(query, [idBonificacion]);
        const data = result[0];
        const montoTotal = parseFloat(decrypt(data.MontoTotal));

        const serie = `${data.Departamento.split(' ').map(word => word.substring(0, 3)).join('')}-${data.IdBonificacion}`;
        const pdf = new jsPDF();
        
        // Encabezado con estilo
        pdf.setFillColor(51, 51, 51);
        pdf.rect(0, 0, 210, 25, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Resumen de Bonificación', 105, 15, { align: 'center' });
        
        // Restaurar color de texto
        pdf.setTextColor(0, 0, 0);
        
        // Crear tarjeta de información
        pdf.setFillColor(249, 250, 251);
        pdf.setDrawColor(230, 230, 230);
        pdf.roundedRect(20, 40, 170, 100, 3, 3, 'FD');
        
        // Formatear fecha
        const fecha = new Date(data.FechahoraGenerado);
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const fechaFormateada = `${diasSemana[fecha.getDay()]}, ${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${fecha.getFullYear()}, ${fecha.toLocaleTimeString('es-GT')}`;
        
        // Información con estilo
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        
        const info = [
            ['Serie:', serie],
            ['ID Bonificación:', data.IdBonificacion.toString()],
            ['Departamento:', data.Departamento],
            ['Mes:', formatearMes(data.Mes.split('-')[1], data.Mes.split('-')[0])],
            ['Monto Total:', `Q ${montoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
            ['Fecha y Hora:', fechaFormateada],
            ['Usuario:', userData.NombreCompleto]
        ];
        
        let y = 55;
        info.forEach(([label, value]) => {
            pdf.setFont('helvetica', 'bold');
            pdf.text(label, 30, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(value, 90, y);
            y += 15;
        });
        
        // Área de firmas con estilo
        pdf.setFillColor(249, 250, 251);
        pdf.roundedRect(20, 160, 170, 60, 3, 3, 'FD');
        
        // Líneas de firma
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.line(30, 190, 100, 190);
        pdf.line(120, 190, 190, 190);
        pdf.line(75, 205, 145, 205); 
        
        pdf.setFontSize(10);
        pdf.text('Firma Entrega', 45, 195);
        pdf.text('Firma Entrega', 140, 195);
        pdf.text('Firma Gerente Regional', 85, 210);
        
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text('Gerente Departamento', 45, 200);
        pdf.text('Sub-Gerente Departamento', 140, 200);
        
        
        // Footer
        pdf.setFillColor(51, 51, 51);
        pdf.rect(0, 267, 210, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text('Documento generado por el Sistema de Recursos Humanos', 105, 273, { align: 'center' });
        
        await connection.query(
            'UPDATE Bonificaciones SET Estado = 2 WHERE IdBonificacion = ?',
            [idBonificacion]
        );
        await connection.query(`
            UPDATE DetalleBonificaciones 
            SET FechaEntrega = CURDATE(),
                FechaHoraEntrego = NOW() 
            WHERE IdBonificacion = ?
        `, [idBonificacion]);
        await connection.close();
        
        pdf.save(`Resumen_Bonificacion_${data.IdBonificacion}.pdf`);
        location.reload();
        
        await Swal.fire({
            icon: 'success',
            title: 'Resumen Generado',
            text: 'El resumen de bonificación ha sido generado exitosamente'
        });
        
    } catch (error) {
        console.error('Error:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo generar el resumen'
        });
    }
}
function sortTable(column) {
    const tbody = document.getElementById('collaboratorsTableBody');
    const rows = Array.from(tbody.getElementsByTagName('tr'));
    const header = document.querySelector(`th[data-sort="${column}"]`);
    
    // Actualizar dirección
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Actualizar clases de los headers
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    header.classList.add(currentSort.direction);

    // Ordenar filas
    rows.sort((a, b) => {
        let valueA, valueB;
        
        if (column === 'nombre') {
            valueA = a.cells[0].textContent;
            valueB = b.cells[0].textContent;
        } else if (column === 'puesto') {
            valueA = a.cells[1].textContent;
            valueB = b.cells[1].textContent;
        }

        if (currentSort.direction === 'asc') {
            return valueA.localeCompare(valueB);
        } else {
            return valueB.localeCompare(valueA);
        }
    });

    // Redibujar tabla
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
}
document.addEventListener('DOMContentLoaded', () => {
    // Llenar selector de años (5 años atrás hasta el año actual)
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();

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