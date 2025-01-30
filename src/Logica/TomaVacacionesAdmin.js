document.addEventListener('DOMContentLoaded', async() => {
    const { ipcRenderer } = require('electron');
    const odbc = require('odbc');
    const conexion = 'DSN=recursos';

    const userData = JSON.parse(localStorage.getItem('userData'));
    const validarpuesto = userData.Id_Puesto;
    const idDepartamento = userData.Id_Departamento;
    const idPersonal = userData.Id;

    let selectedEmployeeId = null;
    let selectedEmployeeName = null;
    let selectedEmployeeDays = null;
    let selectedEmployeePlanilla = null;
    let selectedEmployeeDepartamento = null;
    let selectedEmployeeInicioPlanilla = null;
    let selectedEmployeeDiasMinVT = null;
    let calendar;

    // Función para mostrar/ocultar el loader
    function showLoader() {
        document.getElementById('loader-overlay').style.display = 'flex';
    }

    function hideLoader() {
        document.getElementById('loader-overlay').style.display = 'none';
    }

    // Función para conectar a la base de datos
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

    // Función para mostrar la lista de empleados
    async function loadEmployeeList() {
        showLoader();
        try {
            const connection = await conectar();
            
            // Asignamos directamente baseQuery a query ya que no hay parámetros adicionales
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
                    DiasDisponibles DESC
            `;
    
            const result = await connection.query(query);
            await connection.close();
    
            const tableBody = document.querySelector('#employee-table tbody');
            const searchInput = document.getElementById('employee-search');
    
            function renderEmployees(employees) {
                tableBody.innerHTML = '';
                employees.forEach(employee => {
                    const row = tableBody.insertRow();
                    row.insertCell(0).textContent = employee.NombreCompleto;
                    row.insertCell(1).textContent = formatofecha(employee.Inicio_Planilla);
                    const diasDisponiblesCell = row.insertCell(2);
                    diasDisponiblesCell.textContent = employee.DiasDisponibles;
                    diasDisponiblesCell.className = 'dias-disponibles';
                    row.insertCell(3).textContent = employee.NombrePuesto;
                    row.insertCell(4).textContent = employee.NombreDepartamento;
                    row.insertCell(5).textContent = employee.Nombre_Planilla;
    
                    row.addEventListener('click', () => {
                        selectEmployee(row, employee.IdPersonal, employee.NombreCompleto, 
                                    employee.DiasDisponibles, employee.Id_Planilla,
                                    employee.Id_Departamento, employee.Inicio_Planilla, 
                                    employee.DiasMinVT);
                    });
                });
            }
    
            function filterEmployees() {
                const searchTerm = searchInput.value.toLowerCase();
                const terms = searchTerm.split(' ');
                return result.filter(employee => {
                    const fullName = employee.NombreCompleto.toLowerCase();
                    return terms.every(term => fullName.includes(term));
                });
            }
    
            renderEmployees(result);
    
            searchInput.addEventListener('input', () => {
                const filteredEmployees = filterEmployees();
                renderEmployees(filteredEmployees);
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

    // Función para seleccionar un empleado
    async function selectEmployee(row, employeeId, employeeName, employeeDays, employeePlanilla, 
                               employeeDepartamento, employeeInicioPlanilla, employeeDiasMinVT) {
        const allRows = document.querySelectorAll('#employee-table tbody tr');
        allRows.forEach(r => r.classList.remove('selected'));
        row.classList.add('selected');

        selectedEmployeeId = employeeId;
        selectedEmployeeName = employeeName;
        selectedEmployeeDays = employeeDays;
        selectedEmployeePlanilla = employeePlanilla;
        selectedEmployeeDepartamento = employeeDepartamento;
        selectedEmployeeInicioPlanilla = employeeInicioPlanilla;
        selectedEmployeeDiasMinVT = employeeDiasMinVT;

        const periodo = await getPeriodoVacaciones(selectedEmployeeInicioPlanilla, selectedEmployeeId);
        updateEmployeeInfo(employeeId, periodo);

        document.getElementById('employee-list-toggle').classList.add('collapsed');
        document.getElementById('employee-list').classList.add('collapsed');
        document.getElementById('calendar-container').style.display = 'block';
        document.getElementById('calendar-container').scrollIntoView({ behavior: 'smooth' });

        document.getElementById('selected-employee-info').textContent = 
            `${selectedEmployeeName} - Días disponibles: ${selectedEmployeeDays}`;
        
        initializeCalendar(periodo);
    }

    // Función para actualizar la información del empleado
    async function updateEmployeeInfo(employeeId) {
        try {
            const connection = await conectar();
            const query = `
                SELECT 
                    CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ',
                          personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto,
                    ((DATEDIFF(NOW(), personal.Inicio_Planilla) DIV 365 * 15) - 
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
            const result = await connection.query(query, [employeeId]);
            await connection.close();

            if (result.length > 0) {
                selectedEmployeeName = result[0].NombreCompleto;
                selectedEmployeeDays = result[0].DiasDisponibles;
                document.getElementById('selected-employee-info').textContent = 
                    `${selectedEmployeeName} - Días disponibles: ${selectedEmployeeDays}`;
            }
        } catch (error) {
            console.error('Error updating employee info:', error);
        }
    }

    // Constantes para fechas festivas
    const FechaFestivos = [
        { month: 0, day: 1 },    // Año Nuevo
        { month: 4, day: 1 },    // Día del Trabajo
        { month: 5, day: 30 },   // Día del Ejército
        { month: 8, day: 15 },   // Día de la Independencia
        { month: 9, day: 20 },   // Día de la Revolución
        { month: 10, day: 1 },   // Día de Todos los Santos
        { month: 11, day: 1 }    // Navidad
    ];

    // Función para determinar si es Semana Santa
    function esSemanaSanta(fecha) {
        const anio = fecha.getFullYear();
        const a = anio % 19;
        const b = Math.floor(anio / 100);
        const c = anio % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mesPascua = Math.floor((h + l - 7 * m + 114) / 31);
        const diaPascua = ((h + l - 7 * m + 114) % 31) + 1;

        const pascua = new Date(anio, mesPascua - 1, diaPascua);
        const domingoRamos = new Date(pascua);
        domingoRamos.setDate(pascua.getDate() - 7);
        const domingoResurreccion = pascua;

        return fecha >= domingoRamos && fecha <= domingoResurreccion;
    }

    // Función para verificar si una fecha no es válida para vacaciones
    function esFechaNoValida(date) {
        const dayOfWeek = date.getDay();
        const isFestivo = FechaFestivos.some(festivo => 
            festivo.month === date.getMonth() && festivo.day === date.getDate()
        );
        return dayOfWeek === 0 || dayOfWeek === 6 || isFestivo || esSemanaSanta(date);
    }

    // Función para obtener las fechas de vacaciones
    async function getVacationDates(employeeId) {
        try {
            const connection = await conectar();
            const query = `
                SELECT FechasTomadas
                FROM vacacionestomadas
                WHERE IdPersonal = ?
            `;
            const result = await connection.query(query, [employeeId]);
            await connection.close();
            
            return result.map(row => {
                const date = new Date(row.FechasTomadas);
                return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
            });
        } catch (error) {
            console.error('Error fetching vacation dates:', error);
            return [];
        }
    }
    // Función para obtener el período de vacaciones
    async function getPeriodoVacaciones(inicioPlanilla, idPersonal) {
        try {
            const connection = await conectar();
            const query = `
                SELECT 
                    CONCAT(
                        DATE_FORMAT(p.FechaInicio, '%Y-%m-%d'), 
                        ' al ', 
                        DATE_FORMAT(DATE_ADD(p.FechaInicio, INTERVAL 1 YEAR) - INTERVAL 1 DAY, '%Y-%m-%d')
                    ) AS Periodo,
                    COALESCE(
                        (SELECT SUM(DiasSolicitado)
                         FROM vacacionespagadas
                         WHERE IdPersonal = ? 
                           AND Periodo = CONCAT(DATE_FORMAT(p.FechaInicio, '%Y-%m-%d'), ' al ', 
                                             DATE_FORMAT(DATE_ADD(p.FechaInicio, INTERVAL 1 YEAR) - INTERVAL 1 DAY, '%Y-%m-%d'))
                           AND Estado IN (1,2,3)
                        ), 0
                    ) +
                    COALESCE(
                        (SELECT SUM(DiasSolicitado)
                         FROM vacacionestomadas
                         WHERE IdPersonal = ? 
                           AND Periodo = CONCAT(DATE_FORMAT(p.FechaInicio, '%Y-%m-%d'), ' al ', 
                                             DATE_FORMAT(DATE_ADD(p.FechaInicio, INTERVAL 1 YEAR) - INTERVAL 1 DAY, '%Y-%m-%d'))
                        ), 0
                    ) AS DiasUsados
                FROM (
                    SELECT DATE_ADD(STR_TO_DATE(?, '%Y-%m-%d'), INTERVAL n YEAR) AS FechaInicio
                    FROM (
                        SELECT a.N + b.N * 10 + c.N * 100 AS n
                        FROM (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
                              UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a
                        CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
                                   UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b
                        CROSS JOIN (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
                                   UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
                    ) nums
                    WHERE DATE_ADD(STR_TO_DATE(?, '%Y-%m-%d'), INTERVAL n YEAR) <= NOW()
                ) AS p
                HAVING DiasUsados < 15
                ORDER BY p.FechaInicio
                LIMIT 1
            `;
            
            const result = await connection.query(query, [idPersonal, idPersonal, inicioPlanilla, inicioPlanilla]);
            await connection.close();

            if (result.length > 0) {
                return result[0].Periodo;
            } else {
                throw new Error('No se pudo determinar el período de vacaciones');
            }
        } catch (error) {
            console.error('Error getting vacation period:', error);
            throw error;
        }
    }

    // Función para guardar las vacaciones
    async function saveVacationDays(start, end, totalDays) {
        showLoader();
        try {
            const currentViewDate = calendar.currentViewDate || start;
            const connection = await conectar();
            let remainingDays = totalDays;
            let currentDate = new Date(start);
            const userData = JSON.parse(localStorage.getItem('userData'));
            const idencargado = userData.Id;

            const periodo = await getPeriodoVacaciones(selectedEmployeeInicioPlanilla, selectedEmployeeId);
            
            if (!periodo) {
                throw new Error('No se pudo determinar el período de vacaciones');
            }
            
            const vacationInfo = await getVacationInfo(selectedEmployeeId, periodo);
            const totalDiasTomados = vacationInfo.DiasTomados + totalDays;
            const diasMinimos = selectedEmployeeDiasMinVT;

            if (diasMinimos > 1 && totalDiasTomados < 15 * 0.5 && totalDays < diasMinimos) {
                throw new Error(`Debe seleccionar al menos ${diasMinimos} días de vacaciones.`);
            }

            while (remainingDays > 0) {
                if (currentDate >= end) break;

                if (!esFechaNoValida(currentDate)) {
                    const query = `
                        INSERT INTO vacacionestomadas 
                        (IdPersonal, IdPlanilla, IdDepartamento, IdEncargadoRegistra, DiasSolicitado, Periodo, FechasTomadas)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;
                    await connection.query(query, [
                        selectedEmployeeId,
                        selectedEmployeePlanilla,
                        selectedEmployeeDepartamento,
                        idencargado,
                        1,
                        periodo,
                        currentDate.toISOString().split('T')[0]
                    ]);
                    remainingDays--;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            await connection.close();

            Swal.fire({
                icon: 'success',
                title: 'Vacaciones guardadas',
                text: 'Las vacaciones han sido registradas correctamente.',
            });

            await updateEmployeeInfo(selectedEmployeeId);
            await loadEmployeeList();
            await initializeCalendar();
            calendar.gotoDate(currentViewDate);
        } catch (error) {
            console.error('Error saving vacation days:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'Hubo un problema al guardar las vacaciones. Por favor, intente nuevamente.',
            });
        }
        hideLoader();
    }

    // Función para obtener la información de vacaciones
    async function getVacationInfo(employeeId, periodo) {
        try {
            const connection = await conectar();
            const query = `
                SELECT 
                    IFNULL(SUM(vt.DiasSolicitado), 0) + IFNULL(SUM(vp.DiasSolicitado), 0) AS DiasTomados,
                    pe.DiasMinVT
                FROM personal pe
                INNER JOIN puestos p ON pe.Id_Puesto = p.Id_Puesto
                LEFT JOIN vacacionestomadas vt ON pe.Id = vt.IdPersonal AND vt.Periodo = ?
                LEFT JOIN vacacionespagadas vp ON pe.Id = vp.IdPersonal AND vp.Periodo = ? AND vp.Estado IN (1,2,3)
                WHERE pe.Id = ?
                GROUP BY pe.Id, pe.DiasMinVT
            `;
            const result = await connection.query(query, [periodo, periodo, employeeId]);
            await connection.close();
            
            return result[0] || { DiasTomados: 0, DiasMinVT: 0 };
        } catch (error) {
            console.error('Error getting vacation info:', error);
            throw error;
        }
    }

    // Función para inicializar el calendario
    async function initializeCalendar() {
        if (calendar) {
            calendar.destroy();
        }

        const vacationDates = await getVacationDates(selectedEmployeeId);
        const vacacionesTomadas = await getVacacionesTomadas(idDepartamento);

        const calendarEl = document.getElementById('vacation-calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            selectable: true,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth'
            },
            locale: 'es',
            events: vacacionesTomadas.map(vt => ({
                title: vt.NombreCompleto,
                start: vt.FechasTomadas,
                allDay: true,
                backgroundColor: '#4CAF50',
                borderColor: '#4CAF50',
                classNames: ['vacation-event']
            })),
            eventContent: function(arg) {
                return {
                    html: `<div title="${arg.event.title}" class="event-content">${arg.event.title}</div>`
                };
            },
            select: async function(info) {
                const start = info.start;
                const end = info.end;
                const days = contarDiasValidos(start, end);

                if (days > selectedEmployeeDays) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Exceso de días',
                        text: `Has seleccionado ${days} día(s), pero solo tienes ${selectedEmployeeDays} días disponibles.`,
                    });
                    return;
                }

                Swal.fire({
                    title: days === 1 ? 'Confirmar fecha de vacaciones' : 'Confirmar rango de vacaciones',
                    html: `
                        <p>Fecha de inicio: ${start.toLocaleDateString()}</p>
                        ${days > 1 ? `<p>Fecha de fin: ${new Date(end.getTime() - 86400000).toLocaleDateString()}</p>` : ''}
                        <p>Días solicitados: ${days}</p>
                    `,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Guardar',
                    cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        saveVacationDays(start, end, days);
                    }
                });
            },
            selectAllow: function(selectInfo) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return selectInfo.start >= today && !esFechaNoValida(selectInfo.start);
            },
            dayCellDidMount: function(info) {
                if (esFechaNoValida(info.date)) {
                    info.el.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
                }
                if (esFechaVacaciones(info.date, vacationDates)) {
                    info.el.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
                }
            }
        });

        calendar.render();
    }

    // Función para contar días válidos
    function contarDiasValidos(start, end) {
        let count = 0;
        let currentDate = new Date(start);
        while (currentDate < end) {
            if (!esFechaNoValida(currentDate)) {
                count++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return count;
    }

    // Función para verificar si es una fecha de vacaciones
    function esFechaVacaciones(date, vacationDates) {
        return vacationDates.some(vDate => 
            vDate.getDate() === date.getDate() && 
            vDate.getMonth() === date.getMonth() && 
            vDate.getFullYear() === date.getFullYear()
        );
    }

    // Función para formatear fechas
    function formatofecha(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    // Función para obtener las vacaciones tomadas
    async function getVacacionesTomadas(departamentoId) {
        try {
            const connection = await conectar();
            const query = `
                SELECT 
                    vt.FechasTomadas, 
                    CONCAT(p.Primer_Nombre, ' ', IFNULL(p.Segundo_Nombre, ''), ' ', 
                        p.Primer_Apellido, ' ', IFNULL(p.Segundo_Apellido, '')) AS NombreCompleto
                FROM vacacionestomadas vt
                INNER JOIN personal p ON vt.IdPersonal = p.Id
                WHERE vt.IdDepartamento = ?
                ORDER BY vt.FechasTomadas
            `;
            const result = await connection.query(query, [departamentoId]);
            await connection.close();
            return result;
        } catch (error) {
            console.error('Error al obtener vacaciones tomadas:', error);
            return [];
        }
    }

    // Event listener para el toggle de la lista de empleados
    document.getElementById('employee-list-toggle').addEventListener('click', () => {
        document.getElementById('employee-list').classList.toggle('collapsed');
    });

    // Cargar la lista de empleados al iniciar
    await loadEmployeeList();
});