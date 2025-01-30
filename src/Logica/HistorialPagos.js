const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const idencargado = userData.Id;
    const idDepartamento = userData.Id_Departamento;
    const odbc = require('odbc');
    const conexion = 'DSN=recursos';

    function showLoader() {
        document.getElementById('loader-overlay').style.display = 'flex';
    }

    function hideLoader() {
        document.getElementById('loader-overlay').style.display = 'none';
    }

    async function conectar() {
        try {
            const connection = await odbc.connect(conexion);
            await connection.query('SET NAMES utf8mb4');
            return connection;
        } catch (error) {
            console.error('Error al conectar a la base de datos:', error);
            throw error;
        }
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('es-GT');
    }

    function formatCurrency(amount) {
        if (!amount) return 'Q 0.00';
        return `Q ${new Intl.NumberFormat('es-GT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount)}`;
    }

    // Verificar permisos
    async function verificarPermiso123() {
        try {
            const connection = await conectar();
            const query = `
                SELECT COUNT(*) AS tienePermiso
                FROM TransaccionesRRHH
                WHERE IdPersonal = ? AND Codigo = '123' AND Activo = 1
            `;
            const result = await connection.query(query, [idencargado]);
            await connection.close();
            return result[0].tienePermiso > 0;
        } catch (error) {
            console.error('Error al verificar permisos:', error);
            return false;
        }
    }

    // Cargar estados de pago
    async function cargarEstadosPago() {
        try {
            const connection = await conectar();
            const query = `SELECT IdEstado, Estado FROM EstadopagoVacas WHERE IdEstado IN (1, 2, 3, 4)`;
            const estados = await connection.query(query);
            await connection.close();

            const select = document.getElementById('estado-pago-select');
            select.innerHTML = '<option value="">Seleccione un estado de pago</option>';
            estados.forEach(estado => {
                const option = document.createElement('option');
                option.value = estado.IdEstado;
                option.textContent = estado.Estado;
                select.appendChild(option);
            });

            // Cargar contadores iniciales
            await actualizarContadores();

            // Agregar evento change
            select.addEventListener('change', cargarReportePagos);
        } catch (error) {
            console.error('Error cargando estados de pago:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar los estados de pago.'
            });
        }
    }

    // Actualizar contadores de estado
    async function actualizarContadores() {
        try {
            const connection = await conectar();
            const tienePermiso = await verificarPermiso123();
            let query = `
                SELECT Estado, COUNT(*) as cantidad
                FROM vacacionespagadas
                WHERE Estado IN (1, 2, 3)
            `;

            if (!tienePermiso) {
                query += ` AND IdDepartamento = ?`;
            }

            query += ` GROUP BY Estado`;

            const result = await connection.query(query, tienePermiso ? [] : [idDepartamento]);
            await connection.close();

            // Inicializar contadores
            const contadores = {
                pending: 0,    // Estado 1
                authorized: 0, // Estado 2
                completed: 0   // Estado 3
            };

            // Actualizar contadores según resultados
            result.forEach(row => {
                switch(row.Estado) {
                    case 1: contadores.pending = row.cantidad; break;
                    case 2: contadores.authorized = row.cantidad; break;
                    case 3: contadores.completed = row.cantidad; break;
                }
            });

            // Actualizar badges
            document.querySelector('[data-status="pending"] .count').textContent = contadores.pending;
            document.querySelector('[data-status="authorized"] .count').textContent = contadores.authorized;
            document.querySelector('[data-status="completed"] .count').textContent = contadores.completed;

        } catch (error) {
            console.error('Error actualizando contadores:', error);
        }
    }

    // Cargar reporte de pagos
    async function cargarReportePagos() {
        const estadoPago = document.getElementById('estado-pago-select').value;
        if (!estadoPago) return;

        showLoader();
        try {
            const connection = await conectar();
            const tienePermiso = await verificarPermiso123();
            
            let query = `
                SELECT
                    vp.Idpagovacas,
                    CONCAT(p.Primer_Nombre, ' ', IFNULL(p.Segundo_Nombre, ''), ' ',
                          p.Primer_Apellido, ' ', IFNULL(p.Segundo_Apellido, '')) AS NombreCompleto,
                    vp.FechaRegistro,
                    vp.DiasSolicitado,
                    vp.Periodo,
                    pl.Nombre_Planilla,
                    d.Nombre AS NombreDepartamento,
                    CONCAT(reg.Primer_Nombre, ' ', IFNULL(reg.Segundo_Nombre, ''), ' ',
                          reg.Primer_Apellido, ' ', IFNULL(reg.Segundo_Apellido, '')) AS PersonaRegistro,
                    CONCAT(pago.Primer_Nombre, ' ', IFNULL(pago.Segundo_Nombre, ''), ' ',
                          pago.Primer_Apellido, ' ', IFNULL(pago.Segundo_Apellido, '')) AS PersonaPago,
                    vp.NoCheque,
                    vp.NoRecibo,
                    vp.FechaPago,
                    vp.TotalaRecibir
                FROM vacacionespagadas vp
                INNER JOIN personal p ON vp.IdPersonal = p.Id
                INNER JOIN planillas pl ON vp.IdPlanilla = pl.Id_Planilla
                INNER JOIN departamentos d ON vp.IdDepartamento = d.Id_Departamento
                INNER JOIN personal reg ON vp.IdEncargado = reg.Id
                LEFT JOIN personal pago ON vp.IdPersonalpago = pago.Id
                WHERE vp.Estado = ?
            `;

            const queryParams = [estadoPago];

            if (!tienePermiso) {
                query += ` AND vp.IdDepartamento = ?`;
                queryParams.push(idDepartamento);
            }

            query += ` ORDER BY vp.FechaRegistro DESC`;

            const result = await connection.query(query, queryParams);
            await connection.close();

            const tableBody = document.querySelector('#reporte-pagos-table tbody');
            tableBody.innerHTML = '';

            result.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.Idpagovacas}</td>
                    <td>${row.NombreCompleto}</td>
                    <td>${formatDate(row.FechaRegistro)}</td>
                    <td>${row.DiasSolicitado}</td>
                    <td>${row.Periodo}</td>
                    <td>${row.Nombre_Planilla}</td>
                    <td>${row.NombreDepartamento}</td>
                    <td>${row.PersonaRegistro}</td>
                    <td>${row.PersonaPago || '-'}</td>
                    <td>${row.NoCheque || '-'}</td>
                    <td>${row.NoRecibo || '-'}</td>
                    <td>${formatDate(row.FechaPago) || '-'}</td>
                `;
                tableBody.appendChild(tr);
            });

            document.getElementById('reporte-pagos-grid').style.display = 'block';

        } catch (error) {
            console.error('Error cargando reporte de pagos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar el reporte de pagos.'
            });
        } finally {
            hideLoader();
        }
    }

    // Inicializar página
    await cargarEstadosPago();
});