const { ipcRenderer } = require('electron');
const odbc = require('odbc');
const Swal = require('sweetalert2');
const conexion = 'DSN=recursos'; 

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
async function loadDashboardData() {
    const userData = JSON.parse(localStorage.getItem('userData'));
    
    try {
        const connection = await connectionString();
        const permiso123 = await verificarPermiso123(userData.Id);

        if (permiso123) {
            // Mostrar dashboard de admin
            document.getElementById('admin-stats').style.display = 'grid';
            document.getElementById('user-stats').style.display = 'none';

            // Cargar solicitudes pendientes
            const pendingQuery = `
                SELECT COUNT(*) as count 
                FROM vacacionespagadas 
                WHERE Estado = 1
            `;
            const pendingResult = await connection.query(pendingQuery);
            document.getElementById('pending-count').textContent = pendingResult[0].count;

            // Cargar próximos aniversarios (personas que cumplen año en los próximos 30 días)
            const anniversaryQuery = `
                SELECT COUNT(*) as count 
                FROM personal p
                INNER JOIN departamentos d ON p.Id_Departamento = d.Id_Departamento
                WHERE 
                    DATEDIFF(
                        DATE_ADD(p.Inicio_Planilla, 
                            INTERVAL YEAR(CURDATE())-YEAR(p.Inicio_Planilla) + 
                            IF(DAYOFYEAR(CURDATE()) > DAYOFYEAR(p.Inicio_Planilla),1,0) YEAR),
                        CURDATE()) <= 30
                    AND p.Estado IN (1,2)
            `;
            const anniversaryResult = await connection.query(anniversaryQuery);
            document.getElementById('next-anniversary-count').textContent = anniversaryResult[0].count;

            // Cargar pagos por autorizar
            const paymentsQuery = `
                SELECT COUNT(*) as count 
                FROM vacacionespagadas 
                WHERE Estado = 2
            `;
            const paymentsResult = await connection.query(paymentsQuery);
            document.getElementById('payments-count').textContent = paymentsResult[0].count;

        } else {
            // Mostrar dashboard de usuario
            document.getElementById('admin-stats').style.display = 'none';
            document.getElementById('user-stats').style.display = 'grid';

            // Cargar días disponibles
            const daysQuery = `
                SELECT 
                    ((DATEDIFF(NOW(), personal.Inicio_Planilla) DIV 365.25 * 15) - 
                     IFNULL(vp.TotalDiasSolicitados, 0) - IFNULL(vt.TotalDiasSolicitados, 0)) AS DiasDisponibles
                FROM personal 
                LEFT JOIN (
                    SELECT IdPersonal, SUM(DiasSolicitado) AS TotalDiasSolicitados
                    FROM vacacionespagadas
                    WHERE Estado IN (1, 2, 3)
                    GROUP BY IdPersonal
                ) vp ON personal.Id = vp.IdPersonal
                LEFT JOIN (
                    SELECT IdPersonal, SUM(DiasSolicitado) AS TotalDiasSolicitados
                    FROM vacacionestomadas
                    GROUP BY IdPersonal
                ) vt ON personal.Id = vt.IdPersonal
                WHERE personal.Id = ?
            `;
            const daysResult = await connection.query(daysQuery, [userData.Id]);
            document.getElementById('available-days').textContent = daysResult[0].DiasDisponibles;

            // Cargar próximo aniversario
            const nextAnniversaryQuery = `
                SELECT 
                    DATE_FORMAT(
                        DATE_ADD(Inicio_Planilla, 
                            INTERVAL YEAR(CURDATE())-YEAR(Inicio_Planilla) + 
                            IF(DAYOFYEAR(CURDATE()) > DAYOFYEAR(Inicio_Planilla),1,0) YEAR),
                        '%d/%m/%Y'
                    ) as ProximoAniversario
                FROM personal
                WHERE Id = ?
            `;
            const anniversaryResult = await connection.query(nextAnniversaryQuery, [userData.Id]);
            document.getElementById('next-anniversary').textContent = anniversaryResult[0].ProximoAniversario;

            // Cargar solicitudes pendientes del usuario
            const userRequestsQuery = `
                SELECT COUNT(*) as count 
                FROM vacacionespagadas 
                WHERE IdPersonal = ? AND Estado IN (1, 2)
            `;
            const requestsResult = await connection.query(userRequestsQuery, [userData.Id]);
            document.getElementById('pending-requests').textContent = requestsResult[0].count;
        }

        await connection.close();

    } catch (error) {
        console.error('Error cargando datos del dashboard:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Hubo un problema al cargar los datos del dashboard.'
        });
    }
}

// Función auxiliar para verificar permiso 123
async function verificarPermiso123(idPersonal) {
    try {
        const connection = await connectionString();
        const query = `
            SELECT COUNT(*) as tiene_permiso 
            FROM TransaccionesRRHH 
            WHERE IdPersonal = ? AND Codigo = '123' AND Activo = 1
        `;
        const result = await connection.query(query, [idPersonal]);
        await connection.close();
        return result[0].tiene_permiso > 0;
    } catch (error) {
        console.error('Error verificando permiso 123:', error);
        return false;
    }
}
function getGreetingIcon() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
        return '../Imagenes/Buenosdias.png';
    } else if (hour >= 12 && hour < 18) {
        return '../Imagenes/Buenastarde.png';
    } else {
        return '../Imagenes/Buenasnoches.png';
    }
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = '';
    if (hour >= 5 && hour < 12) {
        greeting = 'Buenos días';
    } else if (hour >= 12 && hour < 18) {
        greeting = 'Buenas tardes';
    } else {
        greeting = 'Buenas noches';
    }
    return greeting;
}

document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    
    // Actualizar saludo e icono
    const welcomeMessage = document.querySelector('.welcome-message');
    welcomeMessage.innerHTML = `
        <div class="greeting-container">
            <img src="${getGreetingIcon()}" alt="Greeting" class="greeting-icon">
            <h2>${updateGreeting()}, Bienvenido al Sistema de Recursos Humanos</h2>
            <img src="../Imagenes/Logo3.JPG" alt="Logo" class="welcome-logo">
        </div>
    `;

    if (userData) {
        document.querySelector('.user-name').textContent = userData.NombreCompleto;
    }

    // Verificar permiso para mostrar menú de admin
    try {
        const connection = await connectionString();
        const result = await connection.query(
            'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
            [userData.Id, '100']
        );
        await connection.close();

        if (result[0].tiene_permiso > 0) {
            document.getElementById('menuVacacionesAdmin').style.display = 'block';
        }
    } catch (error) {
        console.error('Error al verificar permisos de admin:', error);
    }

    // Manejo del menú
    const menuBtns = document.querySelectorAll('.menu-btn');
    menuBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const submenu = btn.nextElementSibling;
            const isActive = btn.classList.contains('active');

            // Cerrar otros submenús
            document.querySelectorAll('.menu-btn.active').forEach(activeBtn => {
                if (activeBtn !== btn) {
                    activeBtn.classList.remove('active');
                    activeBtn.nextElementSibling.classList.remove('active');
                }
            });

            // Toggle del submenú actual
            btn.classList.toggle('active');
            submenu.classList.toggle('active');

            // Animación suave del ícono
            const arrow = btn.querySelector('.arrow');
            arrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(-180deg)';
        });
    });

    // Event Listeners para los menús existentes
    document.getElementById('nuevoregistro').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '107']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_adicionales');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 107'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });

    document.getElementById('tomaVacaciones').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '101']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_toma_vacaciones');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 101'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });

    document.getElementById('solicitudPago').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '103']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_pago_vacaciones');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 103'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });

    document.getElementById('docVacaciones').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '104']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_doc_vacaciones');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 104'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });
    document.getElementById('historialVacaciones').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '105']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_historial_vacaciones');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 105'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });
    document.getElementById('historialPagos').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '106']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_historial_pagos_vacas');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 106'
                });
            }
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error al verificar los permisos de usuario'
            });
        }
    });
    // Event Listeners para los nuevos menús de admin
    document.getElementById('registroVacaciones').addEventListener('click', async (e) => {
        ipcRenderer.send('open_registro_vacaciones');
    });

    document.getElementById('registroPagoVacaciones').addEventListener('click', async (e) => {
                ipcRenderer.send('open_registro_pago_vacaciones');
    });
    document.getElementById('pagosPorAutorizar').addEventListener('click', async (e) => {
        ipcRenderer.send('open_pago_por_vacaciones');
    });
    document.getElementById('pagosAutorizados').addEventListener('click', async (e) => {
        ipcRenderer.send('open_pago_autorizados_vacaciones');
    });
    // Manejo del botón de cierre de sesión
    document.querySelector('.logout-btn').addEventListener('click', () => {
        localStorage.removeItem('userData');
        window.location.href = 'Autenticacion.html';
    });

    // Toggle del menú lateral
    document.getElementById('toggleMenu').addEventListener('click', () => {
        document.querySelector('.sidebar').classList.toggle('collapsed');
        document.querySelector('.main-content').classList.toggle('expanded');
    });
    await loadDashboardData();
    
    // Actualizar datos cada 5 minutos
    setInterval(loadDashboardData, 300000);
});