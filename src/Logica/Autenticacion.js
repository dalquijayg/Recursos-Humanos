const odbc = require('odbc');
const path = require('path');
const { json } = require('stream/consumers');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos'; // Asegúrate de tener configurado el DSN correctamente
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
async function verificarDPI(dpi) {
    try {
        const connection = await connectionString();
        const result = await connection.query(`SELECT
                                                personal.Id, 
                                                CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto, 
                                                personal.Id_Departamento, 
                                                departamentos.Nombre, 
                                                puestos_general.Id_Puesto,
                                                personal.Secret_2FA
                                            FROM
                                                personal
                                                INNER JOIN
                                                departamentos
                                                ON 
                                                    personal.Id_Departamento = departamentos.Id_Departamento
                                                INNER JOIN
                                                puestos
                                                ON 
                                                    personal.Id_Puesto = puestos.Id_Puesto
                                                INNER JOIN
                                                puestos_general
                                                ON 
                                                    puestos.Id_PuestoGeneral = puestos_general.Id_Puesto
                                            WHERE
                                                No_DPI = ?`, [dpi]);
        await connection.close();
        if (result.length > 0) {
            return result[0];
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error de conexión o consulta:', error);
        throw error;
    }
}

async function guardarSecret2FA(id, secret) {
    try {
        const connection = await odbc.connect(conexion);
        await connection.query('UPDATE personal SET Secret_2FA = ? WHERE Id = ?', [secret, id]);
        await connection.close();
        return true;
    } catch (error) {
        console.error('Error al guardar Secret_2FA:', error);
        return false;
    }
}

async function mostrarConfiguracion2FA(userData) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userData.NombreCompleto, 'Sistema RRHH', secret);
    
    try {
        const qrCodeUrl = await qrcode.toDataURL(otpauth);
        
        const result = await Swal.fire({
            title: 'Configuración de Autenticación de Dos Factores',
            html: `
                <div style="text-align: center;">
                    <p>Para comenzar a usar la autenticación de dos factores, sigue estos pasos:</p>
                    <ol style="text-align: left;">
                        <li>Descarga una aplicación de autenticación como Google Authenticator o Authy</li>
                        <li>Escanea el siguiente código QR con la aplicación:</li>
                    </ol>
                    <img src="${qrCodeUrl}" style="margin: 20px auto;">
                    <p>O ingresa este código manualmente en tu aplicación:</p>
                    <code style="background: #f0f0f0; padding: 10px; display: block; word-break: break-all;">${secret}</code>
                    <p>Una vez configurado, ingresa el código de 6 dígitos que aparece en tu aplicación:</p>
                </div>
            `,
            input: 'text',
            inputAttributes: {
                autocapitalize: 'off',
                maxlength: 6,
                inputmode: 'numeric',
                pattern: '[0-9]*'
            },
            showCancelButton: true,
            confirmButtonText: 'Verificar y Activar',
            cancelButtonText: 'Cancelar',
            allowOutsideClick: false
        });

        if (result.isConfirmed) {
            const code = result.value;
            const isValid = authenticator.verify({
                token: code,
                secret: secret
            });

            if (isValid) {
                const saved = await guardarSecret2FA(userData.Id, secret);
                if (saved) {
                    await Swal.fire({
                        icon: 'success',
                        title: '¡Configuración exitosa!',
                        text: 'La autenticación de dos factores ha sido activada correctamente.'
                    });
                    userData.Secret_2FA = secret;
                    return userData;
                } else {
                    throw new Error('Error al guardar la configuración');
                }
            } else {
                throw new Error('Código incorrecto');
            }
        } else {
            throw new Error('Configuración cancelada');
        }
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Error en la configuración',
            text: error.message || 'No se pudo completar la configuración de 2FA'
        });
        throw error;
    }
}

function validarEntrada(event) {
    const input = event.target;
    input.value = input.value.replace(/[^0-9]/g, ''); // Eliminar cualquier carácter que no sea un número
}

function habilitarBoton() {
    const input = document.getElementById('dpi');
    const boton = document.querySelector('.btn');
    boton.disabled = input.value.length !== 13; // Habilitar el botón solo si hay 13 dígitos
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const dpi = document.getElementById('dpi').value;

    try {
        let userData = await verificarDPI(dpi);
        if (userData) {
            // Si no tiene 2FA configurado, mostrar configuración
            if (!userData.Secret_2FA) {
                try {
                    userData = await mostrarConfiguracion2FA(userData);
                } catch (error) {
                    console.error('Error en configuración 2FA:', error);
                    return;
                }
            }

            // Solicitar código 2FA
            const result = await Swal.fire({
                title: 'Ingrese el código de autenticación',
                html: 'Ingrese el código de 6 dígitos de su aplicación autenticadora',
                input: 'text',
                inputAttributes: {
                    autocapitalize: 'off',
                    maxlength: 6,
                    inputmode: 'numeric',
                    pattern: '[0-9]*'
                },
                showCancelButton: true,
                confirmButtonText: 'Verificar',
                showLoaderOnConfirm: true,
                preConfirm: (code) => {
                    if (!/^\d{6}$/.test(code)) {
                        Swal.showValidationMessage('El código debe tener 6 dígitos numéricos');
                        return false;
                    }
                    
                    const isValid = authenticator.verify({
                        token: code,
                        secret: userData.Secret_2FA
                    });

                    if (isValid) {
                        localStorage.setItem('userData', JSON.stringify(userData));
                        return true;
                    } else {
                        Swal.showValidationMessage('Código incorrecto o expirado');
                        return false;
                    }
                }
            });

            if (result.isConfirmed) {
                window.location.href = path.join(__dirname, 'Home.html');
            }
        } else {
            await Swal.fire({
                icon: 'error',
                title: 'DPI no encontrado',
                text: 'El número de DPI ingresado no existe en la base de datos.',
                confirmButtonText: 'Aceptar'
            });
        }
    } catch (error) {
        await Swal.fire({
            icon: 'error',
            title: 'Error de Conexión',
            text: 'Hubo un problema al conectar con la base de datos o realizar la consulta.',
            confirmButtonText: 'Aceptar'
        });
    }
});

document.getElementById('dpi').addEventListener('input', (event) => {
    validarEntrada(event);
    habilitarBoton();
});

// Inicializar el estado del botón al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    habilitarBoton();
});