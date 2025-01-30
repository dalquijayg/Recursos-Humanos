const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const idencargado = userData.Id;
    const odbc = require('odbc');
    const conexion = 'DSN=recursos';

    function showLoader() {
        document.getElementById('loader-overlay').style.display = 'flex';
    }

    function hideLoader() {
        document.getElementById('loader-overlay').style.display = 'none';
    }
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

    // Cargar departamentos
    async function cargarDepartamentosReporteVacaciones() {
        try {
            const connection = await conectar();
            const tienePermiso = await verificarPermiso123();
            
            let query;
            let queryParams = [];
    
            if (tienePermiso) {
                // Si tiene permiso 123, muestra todos los departamentos
                query = `SELECT Id_Departamento, Nombre FROM departamentos ORDER BY Nombre ASC`;
            } else {
                // Si no tiene permiso, solo muestra su departamento
                query = `SELECT Id_Departamento, Nombre FROM departamentos 
                        WHERE Id_Departamento = ? 
                        ORDER BY Nombre ASC`;
                queryParams.push(userData.Id_Departamento);
            }
    
            const departamentos = await connection.query(query, queryParams);
            await connection.close();
    
            const select = document.getElementById('departamento-filter-reporte');
            select.innerHTML = '';
            
            if (tienePermiso) {
                select.innerHTML = '<option value="">Todos los departamentos</option>';
            }
    
            departamentos.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.Id_Departamento;
                option.textContent = dept.Nombre;
                select.appendChild(option);
            });
    
            // Si el usuario no tiene permiso 123, seleccionar automáticamente su departamento
            if (!tienePermiso) {
                select.value = userData.Id_Departamento;
                select.disabled = true; // Deshabilitar el select
            }
    
        } catch (error) {
            console.error('Error loading departamentos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar los departamentos.'
            });
        }
    }

    // Generar reporte
    async function generarReporteVacaciones() {
        const fechaDesde = document.getElementById('fecha-desde').value;
        const fechaHasta = document.getElementById('fecha-hasta').value;
        const tienePermiso = await verificarPermiso123();
        let departamentoId;
        if (tienePermiso) {
            departamentoId = document.getElementById('departamento-filter-reporte').value;
        } else {
            departamentoId = userData.Id_Departamento;
        }
    
        if (!fechaDesde || !fechaHasta) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Por favor, selecciona ambas fechas.'
            });
            return;
        }

        showLoader();
        try {
            const connection = await conectar();
            let query = `
                SELECT
                    vacacionestomadas.IdPersonal,
                    CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                        personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto, 
                    vacacionestomadas.Periodo, 
                    departamentos.Nombre AS Departamento,
                    COUNT(vacacionestomadas.IdVacastomadas) AS TotalVacaciones
                FROM
                    vacacionestomadas
                    INNER JOIN personal ON vacacionestomadas.IdPersonal = personal.Id
                    INNER JOIN departamentos ON vacacionestomadas.IdDepartamento = departamentos.Id_Departamento
                WHERE
                    vacacionestomadas.FechasTomadas BETWEEN ? AND ?
            `;

            const queryParams = [fechaDesde, fechaHasta];
            if (!tienePermiso || departamentoId) {
                query += ` AND vacacionestomadas.IdDepartamento = ?`;
                queryParams.push(departamentoId);
            }
            if (departamentoId) {
                query += ` AND vacacionestomadas.IdDepartamento = ?`;
                queryParams.push(departamentoId);
            }

            query += `
                GROUP BY
                    personal.Id, vacacionestomadas.Periodo, departamentos.Nombre
                ORDER BY
                    NombreCompleto
            `;

            const reporteVacaciones = await connection.query(query, queryParams);
            await connection.close();

            const tableBody = document.querySelector('#reporte-vacaciones-table tbody');
            tableBody.innerHTML = '';

            if (reporteVacaciones.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4">No se encontraron datos para el período seleccionado.</td></tr>';
            } else {
                reporteVacaciones.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row.NombreCompleto}</td>
                        <td>${row.Periodo}</td>
                        <td>${row.Departamento}</td>
                        <td>${row.TotalVacaciones}</td>
                    `;
                    tr.addEventListener('click', () => mostrarDetalleVacaciones(
                        row.IdPersonal,
                        row.Periodo,
                        row.NombreCompleto,
                        fechaDesde,
                        fechaHasta
                    ));
                    tableBody.appendChild(tr);
                });
            }

            document.getElementById('reporte-vacaciones-grid').style.display = 'block';
        } catch (error) {
            console.error('Error generando reporte de vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al generar el reporte de vacaciones.'
            });
        } finally {
            hideLoader();
        }
    }

    // Mostrar detalle de vacaciones
    async function mostrarDetalleVacaciones(idPersonal, periodo, nombreCompleto, fechaDesde, fechaHasta) {
        showLoader();
        try {
            const connection = await conectar();
            const query = `
                        SELECT 
                            vt.FechasTomadas,
                            DAYNAME(vt.FechasTomadas) as DiaSemana,
                            CONCAT(p.Primer_Nombre, ' ', IFNULL(p.Segundo_Nombre, ''), ' ', 
                                p.Primer_Apellido, ' ', IFNULL(p.Segundo_Apellido, '')) AS NombreEncargado
                        FROM vacacionestomadas vt
                        INNER JOIN personal p ON vt.IdEncargadoRegistra = p.Id
                        WHERE vt.IdPersonal = ? 
                        AND vt.Periodo = ? 
                        AND vt.FechasTomadas BETWEEN ? AND ?
                        ORDER BY vt.FechasTomadas
                    `;
            const detalleVacaciones = await connection.query(query, [idPersonal, periodo, fechaDesde, fechaHasta]);
            await connection.close();

            const modalContent = document.querySelector('.modal-content');
            const detalleEmpleadoInfo = document.getElementById('detalle-empleado-info');

            const tableBody = document.querySelector('#detalle-vacaciones-table tbody');
            const diasSemana = {
                'Monday': 'Lunes',
                'Tuesday': 'Martes',
                'Wednesday': 'Miércoles',
                'Thursday': 'Jueves',
                'Friday': 'Viernes',
                'Saturday': 'Sábado',
                'Sunday': 'Domingo'
            };
            detalleEmpleadoInfo.textContent = `${nombreCompleto} - Periodo: ${periodo}`;
            tableBody.innerHTML = '';

            detalleVacaciones.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(row.FechasTomadas)}</td>
                    <td>${diasSemana[row.DiaSemana]}</td>
                    <td>${row.NombreEncargado}</td>
                `;
                tableBody.appendChild(tr);
            });

            const modal = document.getElementById('detalle-vacaciones-modal');
            modal.style.display = 'block';

            // Event listeners para cerrar el modal
            const closeBtn = document.getElementsByClassName('close')[0];
            closeBtn.onclick = () => modal.style.display = 'none';

            window.onclick = (event) => {
                if (event.target == modal) {
                    modal.style.display = 'none';
                }
            };
        } catch (error) {
            console.error('Error mostrando detalle de vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al mostrar el detalle de vacaciones.'
            });
        } finally {
            hideLoader();
        }
    }

    // Event listeners
    document.getElementById('generar-reporte-vacaciones').addEventListener('click', generarReporteVacaciones);

    // Inicialización
    await cargarDepartamentosReporteVacaciones();
});