const { ipcRenderer } = require('electron');
const odbc = require('odbc');
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
document.addEventListener('DOMContentLoaded', () => {
    // Obtener datos del usuario del localStorage
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
    document.getElementById('autorizacionboni').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '108']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_Autorizaciones');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 108'
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
    document.getElementById('Entregaboni').addEventListener('click', async (e) => {
        e.preventDefault();
        const userData = JSON.parse(localStorage.getItem('userData'));
        
        try {
            const connection = await connectionString();
            const result = await connection.query(
                'SELECT COUNT(*) as tiene_permiso FROM TransaccionesRRHH WHERE IdPersonal = ? AND Codigo = ?', 
                [userData.Id, '109']
            );
            await connection.close();
    
            if (result[0].tiene_permiso > 0) {
                ipcRenderer.send('open_Entregas');
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'No tiene autorización para acceder a esta función. Transaccion 109'
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
    // Manejo del botón de cierre de sesión
    document.querySelector('.logout-btn').addEventListener('click', () => {
        localStorage.removeItem('userData');
        window.location.href = 'Autenticacion.html';
    });
});