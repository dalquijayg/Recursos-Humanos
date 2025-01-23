const odbc = require('odbc');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos';
const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const userData = JSON.parse(localStorage.getItem('userData'));
const idDepartamento = userData.Id_Departamento;
const idencargado = userData.Id;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'Kj8#mP9$vL2@nQ5&xR7*cY4^hN3$mB90';
const IV_LENGTH = 16;

let currentBonificacionId = null;
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

async function cargarInformacionBonificacion() {
    try {
        const connection = await connectionString();
        
        const query = `
            SELECT
                Bonificaciones.IdBonificacion, 
                departamentos.Nombre AS Departamento, 
                Bonificaciones.MontoTotal, 
                Bonificaciones.Estado,
                EstadoBonificaciones.DescripcionEstado, 
                CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                      personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreEncargado,
                Bonificaciones.FechaAutorizo, 
                Bonificaciones.Mes
            FROM Bonificaciones
            INNER JOIN departamentos ON Bonificaciones.IdDepartamento = departamentos.Id_Departamento
            INNER JOIN EstadoBonificaciones ON Bonificaciones.Estado = EstadoBonificaciones.IdEstado
            INNER JOIN personal ON Bonificaciones.IdAutorizo = personal.Id
            WHERE Bonificaciones.IdDepartamento = ?
            ORDER BY Bonificaciones.IdBonificacion DESC
            LIMIT 1
        `;

        const result = await connection.query(query, [idDepartamento]);
        await connection.close();

        if (result && result.length > 0) {
            const bonificacion = result[0];
            currentBonificacionId = bonificacion.IdBonificacion;
            
            if (bonificacion.Estado !== 3) {
                document.getElementById('estadoAlerta').style.display = 'flex';
                document.getElementById('infoBonificacion').style.display = 'none';
                document.getElementById('mensajeEstado').textContent = `La solicitud se encuentra en estado: ${bonificacion.DescripcionEstado}`;
            } else {
                document.getElementById('estadoAlerta').style.display = 'none';
                document.getElementById('infoBonificacion').style.display = 'block';
                
                const montoDecrypt = parseFloat(decrypt(bonificacion.MontoTotal));
                document.getElementById('montoTotal').textContent = 
                    montoDecrypt.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                
                document.getElementById('departamento').textContent = bonificacion.Departamento;
                document.getElementById('autorizadoPor').textContent = bonificacion.NombreEncargado;
                document.getElementById('fechaAutorizacion').textContent = 
                    new Date(bonificacion.FechaAutorizo).toLocaleDateString('es-GT');
                document.getElementById('mesBonificacion').textContent = bonificacion.Mes;
                document.getElementById('estadoActual').textContent = bonificacion.DescripcionEstado;

                await cargarListaPersonal();
            }
        } else {
            await Swal.fire({
                icon: 'info',
                title: 'Sin bonificaciones',
                text: 'No se encontraron bonificaciones para este departamento'
            });
        }
    } catch (error) {
        console.error('Error al cargar la información:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la información de la bonificación'
        });
    }
}
async function cargarListaPersonal() {
    try {
        const connection = await connectionString();
        const query = `
            SELECT
                CONCAT(personal.Primer_Nombre, ' ', 
                      IFNULL(personal.Segundo_Nombre, ''), ' ', 
                      personal.Primer_Apellido, ' ', 
                      IFNULL(personal.Segundo_Apellido, '')) AS NombreColaborador,
                DetalleBonificaciones.Monto,
                DetalleBonificaciones.IdUsuario
            FROM Bonificaciones
            INNER JOIN DetalleBonificaciones 
                ON Bonificaciones.IdBonificacion = DetalleBonificaciones.IdBonificacion
            INNER JOIN personal 
                ON DetalleBonificaciones.IdUsuario = personal.Id
            WHERE DetalleBonificaciones.IdBonificacion = ?
                AND (DetalleBonificaciones.IdPersonaEntrego IS NULL OR DetalleBonificaciones.IdPersonaEntrego = '');
        `;

        const result = await connection.query(query, [currentBonificacionId]);
        await connection.close();

        const listaPersonal = document.getElementById('listaPersonal');
        listaPersonal.innerHTML = '';

        result.forEach(persona => {
            const montoDecrypt = parseFloat(decrypt(persona.Monto));
            const montoFormateado = montoDecrypt.toLocaleString('es-GT', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });

            const personalCard = document.createElement('div');
            personalCard.className = 'personal-card';
            
            personalCard.innerHTML = `
                <div class="personal-info">
                    <div class="personal-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="personal-details">
                        <div class="personal-name">${persona.NombreColaborador}</div>
                        <div class="personal-monto">
                            <i class="fas fa-quetzal">Q</i>
                            <span class="monto-value" style="display: none">${montoFormateado}</span>
                            <span class="monto-hidden">*****</span>
                            <button class="toggle-monto" onclick="toggleMonto(this)">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            listaPersonal.appendChild(personalCard);
        });
    } catch (error) {
        console.error('Error al cargar la lista de personal:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar la lista del personal'
        });
    }
}
async function cargarDetallePersonal() {
    try {
        const connection = await connectionString();
        const query = `
            SELECT
                CONCAT(personal.Primer_Nombre, ' ', 
                      IFNULL(personal.Segundo_Nombre, ''), ' ', 
                      personal.Primer_Apellido, ' ', 
                      IFNULL(personal.Segundo_Apellido, '')) AS NombreColaborador,
                DetalleBonificaciones.Monto,
                DetalleBonificaciones.IdUsuario
            FROM Bonificaciones
            INNER JOIN DetalleBonificaciones 
                ON Bonificaciones.IdBonificacion = DetalleBonificaciones.IdBonificacion
            INNER JOIN personal 
                ON DetalleBonificaciones.IdUsuario = personal.Id
            WHERE DetalleBonificaciones.IdBonificacion = ?
                AND (DetalleBonificaciones.IdPersonaEntrego IS NULL OR DetalleBonificaciones.IdPersonaEntrego = '');
        `;

        const result = await connection.query(query, [currentBonificacionId]);
        await connection.close();

        const listaPersonal = document.getElementById('listaPersonal');
        listaPersonal.innerHTML = '';

        result.forEach(persona => {
            const itemPersonal = document.createElement('div');
            itemPersonal.className = 'item-personal';
            
            // Almacenar los datos en atributos data-
            itemPersonal.setAttribute('data-id-usuario', persona.IdUsuario);
            itemPersonal.setAttribute('data-nombre', persona.NombreColaborador);
            itemPersonal.setAttribute('data-monto', persona.Monto);
            
            itemPersonal.innerHTML = `
                <div class="info-personal">
                    <i class="fas fa-user"></i>
                    <span>${persona.NombreColaborador}</span>
                </div>
                <button class="btn-ver-monto" onclick="mostrarMontoPersona(this)">
                    <i class="fas fa-eye"></i> Ver Monto
                </button>
            `;
            listaPersonal.appendChild(itemPersonal);
        });

        document.getElementById('modalPersonal').style.display = 'block';
    } catch (error) {
        console.error('Error al cargar el detalle:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo cargar el detalle del personal'
        });
    }
}
async function mostrarMontoPersona(idUsuario, nombre, montoEncriptado) {
    try {
        const montoDecrypt = parseFloat(decrypt(montoEncriptado));
        document.getElementById('nombrePersonalMonto').textContent = nombre;
        document.getElementById('montoIndividual').textContent = 
            montoDecrypt.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Mostrar el modal
        document.getElementById('modalMonto').style.display = 'block';
        
        // Crear o actualizar el botón de finalizar entrega
        let finalizarBtn = document.getElementById('btnFinalizarEntrega');
        if (!finalizarBtn) {
            finalizarBtn = document.createElement('button');
            finalizarBtn.id = 'btnFinalizarEntrega';
            finalizarBtn.className = 'btn-finalizar-entrega';
            finalizarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Entrega';
            document.querySelector('.monto-individual').appendChild(finalizarBtn);
        }
        
        finalizarBtn.onclick = () => finalizarEntrega(idUsuario, nombre);
    } catch (error) {
        console.error('Error al mostrar el monto:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Ocurrió un error al mostrar el monto.'
        });
    }
}
async function mostrarMonto(nombre, montoEncriptado, idUsuario) {
    try {
        // Mostrar el monto directamente sin solicitar código
        const montoDecrypt = parseFloat(decrypt(montoEncriptado));
        document.getElementById('nombrePersonalMonto').textContent = nombre;
        document.getElementById('montoIndividual').textContent = 
            montoDecrypt.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        document.getElementById('modalPersonal').style.display = 'none';
        document.getElementById('modalMonto').style.display = 'block';
        
        // Crear el botón de finalizar entrega si no existe
        let finalizarBtn = document.getElementById('btnFinalizarEntrega');
        if (!finalizarBtn) {
            const montoBody = document.querySelector('.monto-individual');
            finalizarBtn = document.createElement('button');
            finalizarBtn.id = 'btnFinalizarEntrega';
            finalizarBtn.className = 'btn-finalizar-entrega';
            finalizarBtn.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Entrega';
            // Pasar el idUsuario correcto al evento click
            finalizarBtn.onclick = () => finalizarEntrega(idUsuario, nombre);
            montoBody.appendChild(finalizarBtn);
        } else {
            // Actualizar el onclick del botón existente con el nuevo idUsuario
            finalizarBtn.onclick = () => finalizarEntrega(idUsuario, nombre);
        }
    } catch (error) {
        console.error('Error al mostrar el monto:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Ocurrió un error al mostrar el monto.'
        });
    }
}
async function finalizarEntrega(idUsuario, nombre) {
    try {
        const connection = await connectionString();
        const query = `SELECT Secret_2FA FROM personal WHERE Id = ?`;
        const result = await connection.query(query, [idUsuario]);

        if (result && result.length > 0 && result[0].Secret_2FA) {
            const secret = result[0].Secret_2FA;

            const { value: token } = await Swal.fire({
                title: 'Confirmar Entrega',
                text: `Para finalizar la entrega a ${nombre}, ingrese el código temporal`,
                input: 'text',
                inputPlaceholder: 'Código temporal',
                showCancelButton: true,
                confirmButtonText: 'Confirmar Entrega',
                inputValidator: (value) => {
                    if (!value) {
                        return 'Debe ingresar un código temporal';
                    }
                }
            });

            if (token) {
                const isValid = authenticator.verify({ token, secret });

                if (isValid) {
                    await registrarEntrega(connection, idUsuario);
                } else {
                    await Swal.fire({
                        icon: 'error',
                        title: 'Código Inválido',
                        text: 'El código temporal ingresado no es válido.'
                    });
                }
            }
        } else {
            await configurar2FA(connection, idUsuario, nombre);
        }
    } catch (error) {
        console.error('Error al finalizar la entrega:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Ocurrió un error al finalizar la entrega.'
        });
    }
}
async function configurar2FA(connection, idUsuario, nombre) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(nombre, 'RRHH-Dennis', secret);
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    const { isConfirmed } = await Swal.fire({
        title: 'Configurar 2FA',
        html: `
            <p>Para finalizar la entrega, primero debe configurar la autenticación de dos factores.</p>
            <p>Escanee este código QR con su aplicación de autenticación</p>
            <img src="${qrCodeUrl}" alt="Código QR" style="max-width: 100%; height: auto;">
            <p>Una vez escaneado, ingrese el código temporal para confirmar</p>
        `,
        input: 'text',
        inputLabel: 'Código temporal',
        inputPlaceholder: 'Ingrese el código generado por su aplicación',
        showCancelButton: true,
        preConfirm: async (token) => {
            if (!token) {
                Swal.showValidationMessage('Debe ingresar un código temporal');
                return false;
            }
            const isValid = authenticator.verify({ token, secret });
            if (!isValid) {
                Swal.showValidationMessage('El código temporal ingresado no es válido');
                return false;
            }
            return true;
        }
    });

    if (isConfirmed) {
        await connection.query(
            `UPDATE personal SET Secret_2FA = ? WHERE Id = ?`,
            [secret, idUsuario]
        );
        await connection.close();

        await Swal.fire({
            icon: 'success',
            title: '2FA Configurado',
            text: 'La configuración de 2FA se ha completado con éxito. Por favor, intente finalizar la entrega nuevamente.'
        });
    }
}
async function registrarEntrega(connection, idUsuario) {
    const currentDate = moment().tz("America/Guatemala").format('YYYY-MM-DD HH:mm:ss');
    const fechaEntrega = currentDate.split(' ')[0];
    const fechaHoraEntrega = currentDate;

    await connection.query(
        `UPDATE DetalleBonificaciones 
         SET IdPersonaEntrego = ?, 
             FechaEntrega = ?, 
             FechaHoraEntrego = ?
         WHERE IdBonificacion = ? AND IdUsuario = ?`,
        [userData.Id, fechaEntrega, fechaHoraEntrega, currentBonificacionId, idUsuario]
    );

    await connection.close();

    await Swal.fire({
        icon: 'success',
        title: 'Entrega Finalizada',
        text: 'La entrega se ha registrado correctamente.'
    });

    // Cerrar modal y recargar lista
    document.getElementById('modalMonto').style.display = 'none';
    await cargarListaPersonal();
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

async function generarPDF() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    try {
        const { jsPDF } = window.jspdf;
        const departamento = document.getElementById('departamento').textContent;
        const mesBonificacion = document.getElementById('mesBonificacion').textContent;
        const userData = JSON.parse(localStorage.getItem('userData'));
        const connection = await connectionString();
 
        // Obtener datos de bonificación
        const infoQuery = `
            SELECT Bonificaciones.*, departamentos.Nombre AS Departamento
            FROM Bonificaciones 
            INNER JOIN departamentos ON Bonificaciones.IdDepartamento = departamentos.Id_Departamento
            WHERE IdBonificacion = ?`;
        const bonificacion = (await connection.query(infoQuery, [currentBonificacionId]))[0];
        
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'letter'
        });
 
        // Página de resumen
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const [year, month] = bonificacion.Mes.split('-');
        const mesFormateado = `${meses[parseInt(month) - 1]} ${year}`;
        const montoDecrypt = parseFloat(decrypt(bonificacion.MontoTotal));
 
        // Encabezado
        pdf.setFillColor(51, 51, 51);
        pdf.rect(0, 0, 215.9, 25, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(20);
        pdf.text('Hoja de Bonificacion', 105, 15, { align: 'center' });
 
        // Restablecer color de texto
        pdf.setTextColor(0, 0, 0);
 
        // Tarjeta de información
        pdf.setFillColor(249, 250, 251);
        pdf.setDrawColor(230, 230, 230);
        pdf.roundedRect(20, 70, 175, 80, 3, 3, 'FD');
 
        const montoFormateado = montoDecrypt.toLocaleString('es-GT', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
 
        // Títulos y valores
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        const campos = [
            ['No. Bonificación:', bonificacion.IdBonificacion.toString()],
            ['Departamento:', bonificacion.Departamento],
            ['Periodo:', mesFormateado],
            ['Monto Total:', `Q ${montoFormateado}`]
        ];
 
        let yPos = 85;
        campos.forEach(([titulo, valor]) => {
            pdf.setFont('helvetica', 'bold');
            pdf.text(titulo, 30, yPos);
            pdf.setFont('helvetica', 'normal');
            pdf.text(valor, 90, yPos);
            yPos += 15;
        });
 
        // Área de firmas
        pdf.setFillColor(249, 250, 251);
        pdf.roundedRect(20, 160, 175, 60, 3, 3, 'FD');
 
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.5);
        pdf.line(30, 190, 100, 190);
        pdf.line(120, 190, 190, 190);
 
        pdf.setFontSize(10);
        pdf.text('Firma Entregó', 45, 195);
        pdf.text('Firma de Testigo', 140, 195);
 
        pdf.setFontSize(8);
        pdf.setTextColor(128, 128, 128);
        pdf.text('Entregó', 45, 200);
        pdf.text('Gerente de Departamento', 140, 200);
 
        // Footer
        pdf.setFillColor(51, 51, 51);
        pdf.rect(0, 267, 215.9, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(8);
        pdf.text('Documento generado por el Sistema de Recursos Humanos', 105, 273, { align: 'center' });
 
        // Fecha de generación
        pdf.setTextColor(128, 128, 128);
        const fechaGeneracion = new Date().toLocaleDateString('es-GT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        pdf.text(`Generado: ${fechaGeneracion}`, 20, 260);
 
        // Nueva página para boletas
        pdf.addPage();
 
        // Consulta SQL para boletas
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
 
        // Configuración de boletas
        const marginX = 10;
        const marginY = 10;
        const boletaWidth = 98;
        const boletaHeight = 86;
        const columnas = 2;
        const filas = 3;
        const espacioX = 0;
        const espacioY = 0;
        const boletasPorPagina = columnas * filas;
 
        for (let i = 0; i < personal.length; i++) {
            const persona = personal[i];
 
            if (i > 0 && i % boletasPorPagina === 0) {
                pdf.addPage();
            }
 
            const posicionEnPagina = i % boletasPorPagina;
            const columna = posicionEnPagina % columnas;
            const fila = Math.floor(posicionEnPagina / columnas);
            const x = marginX + columna * (boletaWidth + espacioX);
            const y = marginY + fila * (boletaHeight + espacioY);
 
            // Datos y montos
            const puesto = await obtenerPuestoEmpleado(persona.IdUsuario);
            const montoInicialDecrypt = parseFloat(decrypt(persona.MontoInicial));
            const descuentoAuditoriaDecrypt = parseFloat(decrypt(persona.DescuentoAuditoria || '0'));
            const descuentoCreditosDecrypt = parseFloat(decrypt(persona.DescuentoCreditos || '0'));
            const montoFinalDecrypt = parseFloat(decrypt(persona.Monto));
 
            // Dibujar boleta
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(x, y, boletaWidth, boletaHeight);
            pdf.setFillColor(240, 240, 240);
            pdf.rect(x, y, boletaWidth, 8, 'F');
 
            // Título de boleta
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.text('Complemento', x + boletaWidth/2, y + 5, { align: 'center' });
 
            // Información principal
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            let currentY = y + 12;
            const lineHeight = 4.5;
 
            // Información básica
            const basicInfo = [
                [`Departamento: ${departamento}`, currentY],
                [`Puesto: ${puesto}`, currentY + lineHeight],
                [`Colaborador: ${persona.NombreColaborador}`, currentY + lineHeight * 2],
                [`Mes: ${mesFormateado}`, currentY + lineHeight * 3]
            ];
 
            basicInfo.forEach(([texto, yPos]) => {
                pdf.text(texto, x + 4, yPos);
            });
 
            currentY += lineHeight * 4.5;
 
            // Función para dibujar montos
            function drawAmountWithDots(label, amount, yPos) {
                const amountText = `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2 })}`;
                pdf.text(label, x + 4, yPos);
                pdf.text(amountText, x + boletaWidth - 4, yPos, { align: 'right' });
            }
 
            // Desglose de montos
            pdf.setFont('helvetica', 'bold');
            drawAmountWithDots('Monto Inicial:', montoInicialDecrypt, currentY);
            currentY += lineHeight;
 
            // Descuentos y observaciones
            pdf.setFont('helvetica', 'normal');
            if (descuentoAuditoriaDecrypt > 0) {
                drawAmountWithDots('(-) Descuento Auditoría:', descuentoAuditoriaDecrypt, currentY);
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
                drawAmountWithDots('(-) Descuento Créditos:', descuentoCreditosDecrypt, currentY);
                currentY += lineHeight;
 
                if (persona.ObservacionCreditos) {
                    pdf.setFontSize(7);
                    const observacionLines = pdf.splitTextToSize(
                        `Nota: ${persona.ObservacionCreditos}`, 
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
            pdf.setDrawColor(200, 200, 200);
            pdf.line(x + 4, currentY - 2, x + boletaWidth - 4, currentY - 2);
 
            // Monto final
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            drawAmountWithDots('TOTAL A RECIBIR:', montoFinalDecrypt, currentY);
 
            // Firmas
            const firmaWidth = (boletaWidth - 12) / 2;
            const firmaY1 = y + boletaHeight - 18;
            const firmaY2 = y + boletaHeight - 8;
 
            pdf.setFontSize(6.5);
            
            // Firmas superiores
            pdf.line(x + 4, firmaY1, x + firmaWidth - 1, firmaY1);
            pdf.text('Firma Colaborador', x + (firmaWidth/2), firmaY1 + 2, { align: 'center' });
 
            pdf.line(x + firmaWidth + 5, firmaY1, x + boletaWidth - 4, firmaY1);
            pdf.text('Firma Jefe de Área', x + firmaWidth + 5 + (firmaWidth/2), firmaY1 + 2, { align: 'center' });
            // Firma inferior
            const firmaInferiorWidth = boletaWidth * 0.6;
            const firmaInferiorX = x + (boletaWidth - firmaInferiorWidth) / 2;
            pdf.line(firmaInferiorX, firmaY2, firmaInferiorX + firmaInferiorWidth, firmaY2);
            pdf.text('Firma Encargado', firmaInferiorX + (firmaInferiorWidth/2) - 10, firmaY2 + 2);
 
            // Marcas de corte
            const longitudCorte = 3;
            pdf.setDrawColor(150, 150, 150);
            pdf.setLineWidth(0.1);
 
            // Esquinas
            [
                [x, y, x + longitudCorte, y],
                [x, y, x, y + longitudCorte],
                [x + boletaWidth - longitudCorte, y, x + boletaWidth, y],
                [x + boletaWidth, y, x + boletaWidth, y + longitudCorte],
                [x, y + boletaHeight, x + longitudCorte, y + boletaHeight],
                [x, y + boletaHeight - longitudCorte, x, y + boletaHeight],
                [x + boletaWidth - longitudCorte, y + boletaHeight, x + boletaWidth, y + boletaHeight],
                [x + boletaWidth, y + boletaHeight - longitudCorte, x + boletaWidth, y + boletaHeight]
            ].forEach(([x1, y1, x2, y2]) => pdf.line(x1, y1, x2, y2));
        }
        try {
            const currentDate = new Date();
            const fechaEntrega = currentDate.toISOString().split('T')[0];
            const fechaHoraEntrega = currentDate.toISOString().slice(0, 19).replace('T', ' ');
            
            // Actualizar estado en Bonificaciones
            await connection.query(
                'UPDATE Bonificaciones SET Estado = 4 WHERE IdBonificacion = ?',
                [currentBonificacionId]
            );
        
            // Actualizar DetalleBonificaciones
            await connection.query(
                `UPDATE DetalleBonificaciones 
                 SET IdPersonaEntrego = ?,
                     FechaEntrega = ?,
                     FechaHoraEntrego = ?
                 WHERE IdBonificacion = ?`,
                [userData.Id, fechaEntrega, fechaHoraEntrega, currentBonificacionId]
            );
        
            await connection.close();
        } catch (error) {
            console.error('Error al actualizar la base de datos:', error);
            throw error;
        }
        pdf.save(`Bonificacion_${departamento}_${mesFormateado}.pdf`);
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
            text: 'No se pudieron generar las boletas PDF'
        });
    }
 }
//Funcion para mostrar y ocultar montos
function toggleMonto(button) {
    const montoContainer = button.closest('.personal-monto');
    const montoValue = montoContainer.querySelector('.monto-value');
    const montoHidden = montoContainer.querySelector('.monto-hidden');
    const icon = button.querySelector('i');

    if (montoValue.style.display === 'none') {
        montoValue.style.display = 'inline';
        montoHidden.style.display = 'none';
        icon.className = 'fas fa-eye-slash';
    } else {
        montoValue.style.display = 'none';
        montoHidden.style.display = 'inline';
        icon.className = 'fas fa-eye';
    }
}

// Cargar la información cuando el documento esté listo
document.addEventListener('DOMContentLoaded', () => {
    cargarInformacionBonificacion();
    document.getElementById('btnGenerarPDF').addEventListener('click', generarPDF);
});