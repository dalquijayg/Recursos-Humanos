document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const nombreCompleto = userData.NombreCompleto;
    const idencargado = userData.Id;
    const idDepartamento = userData.Id_Departamento;
    const idPersonal = userData.Id;
    const validarpuesto = userData.Id_Puesto;
    const odbc = require('odbc');
    const conexion = 'DSN=recursos';
    // Manejar el toggle del acordeón
    const employeeListToggle = document.getElementById('employee-list-toggle');
    const employeeListContent = document.getElementById('employee-list-content');

    let selectedEmployeeId = null;
    let selectedEmployeePlanilla = null;
    let selectedEmployeeDepartamento = null;
    let selectedEmployeeInicioPlanilla = null;
    let selectedEmployeeDiasMinVP = null;

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
    employeeListToggle.addEventListener('click', () => {
        employeeListToggle.classList.toggle('collapsed');
        employeeListContent.classList.toggle('collapsed');
    });
    // Modificar la función showVacationPaymentInfo para colapsar la lista
    const originalShowVacationPaymentInfo = showVacationPaymentInfo;
    showVacationPaymentInfo = async function(employeeId) {
        await originalShowVacationPaymentInfo(employeeId);
        collapseEmployeeList();
    };
    // Función para colapsar la lista cuando se selecciona un empleado
    function collapseEmployeeList() {
        if (!employeeListToggle.classList.contains('collapsed')) {
            employeeListToggle.classList.add('collapsed');
            employeeListContent.classList.add('collapsed');
        }
    }
    // Cargar lista de empleados
    async function loadEmployeeList() {
        showLoader();
        try {
            const connection = await conectar();
            const query = `
                SELECT 
                    personal.Id AS IdPersonal,
                    CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto,
                    personal.Inicio_Planilla,
                    puestos.Nombre AS NombrePuesto,
                    departamentos.Nombre AS NombreDepartamento,
                    ((DATEDIFF(NOW(), personal.Inicio_Planilla) DIV 365.25 * 15) - IFNULL(vp.TotalDiasSolicitados, 0) - IFNULL(vt.TotalDiasSolicitados, 0)) AS DiasDisponibles,
                    planillas.Nombre_Planilla,
                    personal.Id_Planilla,
                    personal.Id_Departamento, 
                    personal.DiasMinVT, 
                    personal.DiasMinVP
                FROM 
                    personal 
                    INNER JOIN puestos ON personal.Id_Puesto = puestos.Id_Puesto
                    INNER JOIN departamentos ON puestos.Id_Departamento = departamentos.Id_Departamento
                    INNER JOIN planillas ON personal.Id_Planilla = planillas.Id_Planilla
                    LEFT JOIN (
                        SELECT
                            vacacionespagadas.IdPersonal, 
                            SUM(vacacionespagadas.DiasSolicitado) AS TotalDiasSolicitados
                        FROM
                            vacacionespagadas
                        WHERE
                            vacacionespagadas.Estado IN (1, 2, 3)
                        GROUP BY
                            vacacionespagadas.IdPersonal
                    ) vp ON personal.Id = vp.IdPersonal
                    LEFT JOIN (
                        SELECT IdPersonal, SUM(DiasSolicitado) AS TotalDiasSolicitados
                        FROM vacacionestomadas
                        GROUP BY IdPersonal
                    ) vt ON personal.Id = vt.IdPersonal
                WHERE
                    personal.Estado IN (1, 2)
                ORDER BY 
                    DiasDisponibles DESC`;
    
            const result = await connection.query(query);
            await connection.close();
    
            const tableBody = document.querySelector('#employee-table tbody');
            const searchInput = document.getElementById('employee-search');
    
            function renderEmployees(employees) {
                tableBody.innerHTML = '';
                employees.forEach(employee => {
                    const row = tableBody.insertRow();
                    row.insertCell(0).textContent = employee.NombreCompleto;
                    row.insertCell(1).textContent = formatDate(employee.Inicio_Planilla);
                    const diasDisponiblesCell = row.insertCell(2);
                    diasDisponiblesCell.textContent = employee.DiasDisponibles;
                    diasDisponiblesCell.className = 'dias-disponibles';
                    row.insertCell(3).textContent = employee.NombrePuesto;
                    row.insertCell(4).textContent = employee.NombreDepartamento;
                    row.insertCell(5).textContent = employee.Nombre_Planilla;
    
                    row.addEventListener('click', () => {
                        showVacationPaymentInfo(employee.IdPersonal);
                        // Eliminar la clase selected de todas las filas
                        document.querySelectorAll('#employee-table tbody tr').forEach(tr => {
                            tr.classList.remove('selected');
                        });
                        // Añadir la clase selected a la fila clickeada
                        row.classList.add('selected');
                    });
                });
            }
    
            function filterEmployees(searchTerm = '') {
                const filteredEmployees = result.filter(employee => {
                    const fullName = employee.NombreCompleto.toLowerCase();
                    return fullName.includes(searchTerm.toLowerCase());
                });
                renderEmployees(filteredEmployees);
            }
    
            // Renderizar la lista inicial
            renderEmployees(result);
    
            // Event listener para la búsqueda
            searchInput.addEventListener('input', (e) => {
                filterEmployees(e.target.value);
            });
    
        } catch (error) {
            console.error('Error loading employee list:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar la lista de Colaboradores.',
            });
        }
        hideLoader();
    }
    async function showVacationPaymentInfo(employeeId) {
        showLoader();
        try {
            const connection = await conectar();
    
            // Paso 1: Obtener información del empleado
            const employeeQuery = `
                SELECT 
                    personal.Id, 
                    personal.Id_Planilla, 
                    personal.Id_Departamento, 
                    personal.Inicio_Planilla,
                    CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                           personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto,
                    personal.DiasMinVP
                FROM personal
                INNER JOIN puestos p ON personal.Id_Puesto = p.Id_Puesto
                WHERE personal.Id = ?
            `;
            const employeeResult = await connection.query(employeeQuery, [employeeId]);
            
            if (employeeResult.length === 0) {
                throw new Error('Empleado no encontrado');
            }

            const employee = employeeResult[0];
            selectedEmployeeId = employee.Id;
            selectedEmployeePlanilla = employee.Id_Planilla;
            selectedEmployeeDepartamento = employee.Id_Departamento;
            selectedEmployeeInicioPlanilla = employee.Inicio_Planilla;
            selectedEmployeeName = employee.NombreCompleto;
            selectedEmployeeDiasMinVP = employee.DiasMinVP;
    
            // Paso 2: Ejecutar la consulta principal para obtener información de vacaciones
            const queries = [
                `SET @id_empleado = ?;`,
                `SET @inicio = ?;`,
                `SET @hoy = CURDATE();`,
                `SET @dias_por_periodo = 15;`,
                `
                SELECT 
                    CONCAT(
                        DATE_FORMAT(periodo_inicio, '%d-%m-%Y'),
                        ' al ',
                        DATE_FORMAT(periodo_fin, '%d-%m-%Y')
                    ) AS periodo,
                    GREATEST(0, @dias_por_periodo - COALESCE(SUM(dias_vacaciones), 0)) AS dias_disponibles
                FROM (
                    SELECT 
                        DATE_ADD(CAST(@inicio AS DATE), INTERVAL n YEAR) AS periodo_inicio,
                        DATE_SUB(DATE_ADD(CAST(@inicio AS DATE), INTERVAL n+1 YEAR), INTERVAL 1 DAY) AS periodo_fin
                    FROM (
                        SELECT a.N + b.N * 10 + c.N * 100 AS n
                        FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a
                        CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
                        CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
                    ) numbers
                    WHERE DATE_ADD(CAST(@inicio AS DATE), INTERVAL n+1 YEAR) <= @hoy
                ) periodos
                LEFT JOIN (
                    SELECT Periodo, DiasSolicitado AS dias_vacaciones
                    FROM vacacionestomadas
                    WHERE IdPersonal = @id_empleado
                    UNION ALL
                    SELECT Periodo, DiasSolicitado
                    FROM vacacionespagadas
                    WHERE IdPersonal = @id_empleado AND Estado IN (1,2,3)
                ) vacaciones ON vacaciones.Periodo BETWEEN periodos.periodo_inicio AND periodos.periodo_fin
                GROUP BY 
                    periodo_inicio, periodo_fin
                ORDER BY 
                    periodo_inicio;
                `
            ];
    
            let result;
            for (let i = 0; i < queries.length; i++) {
                if (i < 2) {
                    result = await connection.query(queries[i], i === 0 ? [employeeId] : [selectedEmployeeInicioPlanilla]);
                } else {
                    result = await connection.query(queries[i]);
                }
            }
    
            await connection.close();
    
            // Mostrar los resultados en el elemento HTML
            const vacationPaymentInfo = document.getElementById('vacation-payment-info');
            vacationPaymentInfo.innerHTML = `
                <h3>Información de Vacaciones Disponibles para ${selectedEmployeeName}</h3>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Periodo</th>
                                <th>Días Disponibles</th>
                                <th>Días a Solicitar</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.map((row, index) => `
                                <tr>
                                    <td class="periodo-cell">${row.periodo}</td>
                                    <td class="dias-disponibles">${row.dias_disponibles}</td>
                                    <td>
                                        <input type="number" 
                                            class="input-dias" 
                                            value="0" 
                                            min="0" 
                                            max="${row.dias_disponibles}" 
                                            data-index="${index}" 
                                            data-periodo="${row.periodo}">
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <button id="save-vacation-button" class="action-button">
                    Guardar Solicitud de Vacaciones
                </button>
            `;

            // Agregar eventos a los inputs
            const inputsDias = vacationPaymentInfo.querySelectorAll('.input-dias');
            inputsDias.forEach(input => {
                input.addEventListener('change', actualizarDias);
                input.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        actualizarDias.call(this, e);
                    }
                });
            });
            const saveButton = vacationPaymentInfo.querySelector('#save-vacation-button');
            saveButton.addEventListener('click', () => {
                saveVacationRequest(selectedEmployeeId);
            });
            vacationPaymentInfo.style.display = 'block';
    
        } catch (error) {
            console.error('Error detallado al cargar la información de vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar la información de vacaciones: ' + error.message
            });
        }
        hideLoader();
    }

    function actualizarDias(event) {
        const input = event.target;
        const diasDisponiblesElement = input.closest('tr').querySelector('.dias-disponibles');
        let nuevoValor = parseInt(input.value);
        const maxDias = parseInt(diasDisponiblesElement.textContent);
    
        if (isNaN(nuevoValor) || nuevoValor < 0) {
            nuevoValor = 0;
        } else if (nuevoValor > maxDias) {
            nuevoValor = maxDias;
            Swal.fire({
                icon: 'warning',
                title: 'Exceso de días',
                text: `No puedes solicitar más de ${maxDias} días para este período.`
            });
        }
        
        input.value = nuevoValor;
    }

    async function saveVacationRequest(employeeId) {
        if (!employeeId || !selectedEmployeePlanilla || !selectedEmployeeDepartamento) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Información del empleado incompleta. Por favor, seleccione un empleado nuevamente.'
            });
            return;
        }
    
        let connection;
        try {
            connection = await odbc.connect(conexion);
            const inputs = document.querySelectorAll('.input-dias');
            const requests = [];
            const esAdmin = await verificarPermiso123();
    
            for (const input of inputs) {
                const diasSolicitados = parseInt(input.value);
                if (diasSolicitados > 0) {
                    const periodo = reformatearPeriodo(input.dataset.periodo);
                    
                    // Verificar días disponibles del período
                    const query = `
                        SELECT 
                            IFNULL(SUM(CASE WHEN tipo = 'tomadas' THEN dias ELSE 0 END), 0) AS DiasTomados,
                            IFNULL(SUM(CASE WHEN tipo = 'pagadas' THEN dias ELSE 0 END), 0) AS DiasPagados
                        FROM (
                            SELECT 'tomadas' AS tipo, DiasSolicitado AS dias 
                            FROM vacacionestomadas 
                            WHERE IdPersonal = ? AND Periodo = ?
                            UNION ALL
                            SELECT 'pagadas' AS tipo, DiasSolicitado AS dias 
                            FROM vacacionespagadas 
                            WHERE IdPersonal = ? AND Periodo = ? AND Estado IN (1,2,3)
                        ) AS vacaciones
                    `;
                    const [vacationInfo] = await connection.query(query, [employeeId, periodo, employeeId, periodo]);
                    const totalDiasTomados = vacationInfo.DiasTomados + vacationInfo.DiasPagados;
                    const diasDisponiblesEnPeriodo = 15 - totalDiasTomados;
    
                    if (!esAdmin) {
                        if (totalDiasTomados >= 7.5) {
                            if (diasSolicitados < diasDisponiblesEnPeriodo) {
                                throw new Error(`Para el período ${periodo}, debe solicitar todos los ${diasDisponiblesEnPeriodo} días restantes.`);
                            }
                        } else {
                            if (diasSolicitados < selectedEmployeeDiasMinVP) {
                                throw new Error(`Para el período ${periodo}, debe solicitar al menos ${selectedEmployeeDiasMinVP} días de vacaciones.`);
                            }
                        }
                    }
    
                    requests.push({
                        IdPersonal: employeeId,
                        Fecha: new Date().toISOString().split('T')[0],
                        DiasSolicitado: diasSolicitados,
                        Periodo: periodo,
                        IdEncargado: idencargado,
                        IdDepartamento: selectedEmployeeDepartamento,
                        IdPlanilla: selectedEmployeePlanilla
                    });
                }
            }
    
            if (requests.length === 0) {
                throw new Error('Por favor, seleccione al menos un día de vacaciones para solicitar.');
            }
    
            // Realizar las inserciones
            for (const request of requests) {
                const insertQuery = `
                    INSERT INTO vacacionespagadas 
                    (IdPersonal, FechaRegistro, DiasSolicitado, Periodo, IdEncargado, IdDepartamento, IdPlanilla)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                await connection.query(insertQuery, [
                    request.IdPersonal,
                    request.Fecha,
                    request.DiasSolicitado,
                    request.Periodo,
                    request.IdEncargado,
                    request.IdDepartamento,
                    request.IdPlanilla
                ]);
            }
    
            // Mostrar mensaje de éxito
            Swal.fire({
                icon: 'success',
                title: 'Solicitud guardada',
                text: 'La solicitud de vacaciones ha sido guardada exitosamente.'
            });
    
            // Actualizar la información
            showVacationPaymentInfo(employeeId);
    
        } catch (error) {
            console.error('Error al guardar la solicitud de vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'Hubo un problema al guardar la solicitud de vacaciones. Por favor, intente nuevamente.'
            });
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (closeError) {
                    console.error('Error al cerrar la conexión:', closeError);
                }
            }
        }
    }

    function reformatearPeriodo(periodoOriginal) {
        const [inicio, fin] = periodoOriginal.split(' al ');
        const [diaInicio, mesInicio, anioInicio] = inicio.split('-');
        const [diaFin, mesFin, anioFin] = fin.split('-');
        return `${anioInicio}-${mesInicio}-${diaInicio} al ${anioFin}-${mesFin}-${diaFin}`;
    }

    function formatDate(dateString) {
        // Crear la fecha usando UTC para evitar ajustes de zona horaria
        const date = new Date(dateString + 'T00:00:00Z');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }

    async function verificarPermiso123() {
        try {
            const connection = await odbc.connect(conexion);
            const query = `
                SELECT Codigo AS tienePermiso
                FROM TransaccionesRRHH
                WHERE IdPersonal = ? AND Codigo = '123' AND Activo = 1
            `;
            const result = await connection.query(query, [idencargado]);
            await connection.close();
            return result[0] && result[0].tienePermiso === 123;
        } catch (error) {
            console.error('Error al verificar permiso 123:', error);
            return false;
        }
    }

    // Cargar la lista de empleados al iniciar
    loadEmployeeList();
});