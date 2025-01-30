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

    // Formatear moneda
    function formatCurrency(amount) {
        return 'Q ' + new Intl.NumberFormat('es-GT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    // Formatear fecha
    function formatDate(dateString) {
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('es-GT');
    }

    function formatPeriodo(periodo) {
        const [inicio, fin] = periodo.split(' al ');
        return `${formatDate(inicio)} al ${formatDate(fin)}`;
    }

    // Cargar departamentos en el filtro
    async function cargarDepartamentosPagosVacaciones() {
        try {
            const connection = await conectar();
            const query = `SELECT Id_Departamento, Nombre FROM departamentos ORDER BY Nombre ASC`;
            const departamentos = await connection.query(query);
            await connection.close();

            const select = document.getElementById('departamento-filter-pago');
            select.innerHTML = '<option value="">Todos los departamentos</option>';
            departamentos.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.Id_Departamento;
                option.textContent = dept.Nombre;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading departamentos:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar los departamentos.'
            });
        }
    }

    // Listar pagos por autorizar
    async function ListadopagosporAutorizar() {
        showLoader();
        try {
            const connection = await conectar();
            
            await cargarDepartamentosPagosVacaciones();
            
            const query = `
                SELECT 
                    vacacionespagadas.Idpagovacas, 
                    CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                           personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto,
                    vacacionespagadas.FechaRegistro,
                    vacacionespagadas.DiasSolicitado,
                    vacacionespagadas.Periodo,
                    planillas.Nombre_Planilla,
                    departamentos.Nombre AS NombreDepartamento,
                    departamentos.Id_Departamento,
                    CONCAT(encargado.Primer_Nombre, ' ', IFNULL(encargado.Segundo_Nombre, ''), ' ', 
                           encargado.Primer_Apellido, ' ', IFNULL(encargado.Segundo_Apellido, '')) AS NombreEncargado,
                    IF(planillas.tipo = 1, salariosbase.SalarioDiarioGuate, salariosbase.SalarioDiario) AS SalarioDiario,
                    ROUND(IF(planillas.tipo = 1, salariosbase.SalarioDiarioGuate, salariosbase.SalarioDiario) 
                          * vacacionespagadas.DiasSolicitado, 2) AS SalarioTotal
                FROM vacacionespagadas
                INNER JOIN personal ON vacacionespagadas.IdPersonal = personal.Id
                INNER JOIN planillas ON vacacionespagadas.IdPlanilla = planillas.Id_Planilla
                INNER JOIN departamentos ON vacacionespagadas.IdDepartamento = departamentos.Id_Departamento
                INNER JOIN personal AS encargado ON vacacionespagadas.IdEncargado = encargado.Id
                LEFT JOIN salariosbase ON salariosbase.Anyo = SUBSTRING_INDEX(SUBSTRING_INDEX(vacacionespagadas.Periodo, 'al', -1), '-', 1) 
                    AND planillas.Id_Planilla = vacacionespagadas.IdPlanilla
                WHERE vacacionespagadas.Estado = 1
            `;
            const result = await connection.query(query);
            await connection.close();
            document.getElementById('pending-count').textContent = result.length;
            const tableBody = document.querySelector('#pago-vacaciones-table tbody');
            
            function renderTable(data) {
                tableBody.innerHTML = '';
                document.getElementById('pending-count').textContent = data.length;
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row.Idpagovacas}</td>
                        <td>${row.NombreCompleto}</td>
                        <td>${formatDate(row.FechaRegistro)}</td>
                        <td>${row.DiasSolicitado}</td>
                        <td>${formatPeriodo(row.Periodo)}</td>
                        <td>${row.Nombre_Planilla}</td>
                        <td>${row.NombreDepartamento}</td>
                        <td>${row.NombreEncargado}</td>
                        <td class="currency">Q ${formatNumber(row.SalarioDiario)}</td>
                        <td><input type="number" value="${row.SalarioTotal}" step="0.01" min="0" 
                                 class="salario-total-input currency"></td>
                        <td>
                            <button class="save-button" data-id="${row.Idpagovacas}">
                                <i class="fas fa-check"></i> Autorizar
                            </button>
                        </td>
                        <td>
                            <button class="anular-button" data-id="${row.Idpagovacas}">
                                <i class="fas fa-times"></i> Anular
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                // Agregar event listeners a los botones
                document.querySelectorAll('.save-button').forEach(button => {
                    button.addEventListener('click', (event) => RegistroAutorizacion(event.target.dataset.id));
                });
                document.querySelectorAll('.anular-button').forEach(button => {
                    button.addEventListener('click', (event) => AnularPagoVacaciones(event.target.dataset.id));
                });
            }

            renderTable(result);

            // Event listener para el filtro de departamentos
            document.getElementById('departamento-filter-pago').addEventListener('change', function() {
                const selectedDepartamento = this.value;
                const filteredData = selectedDepartamento 
                    ? result.filter(row => row.Id_Departamento.toString() === selectedDepartamento)
                    : result;
                renderTable(filteredData);
            });

        } catch (error) {
            console.error('Error loading pago vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar los datos de pago de vacaciones.'
            });
        }
        hideLoader();
    }
    function formatNumber(amount) {
        return new Intl.NumberFormat('es-GT', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
    // Registrar autorización
    async function RegistroAutorizacion(id) {
        try {
            const row = document.querySelector(`button[data-id="${id}"]`).closest('tr');
            const salarioTotalInput = row.querySelector('.salario-total-input');
            const salarioTotal = parseFloat(salarioTotalInput.value);

            if (isNaN(salarioTotal) || salarioTotal < 0) {
                throw new Error('El salario total debe ser un número válido y no negativo.');
            }

            const result = await Swal.fire({
                title: '¿Está seguro?',
                text: `¿Desea autorizar el pago de vacaciones por ${formatCurrency(salarioTotal)}?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, autorizar',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                const connection = await odbc.connect(conexion);
                const query = `
                    UPDATE vacacionespagadas
                    SET TotalaRecibir = ?, IdPerAutAnu = ?, FechaAutAnu = CURDATE(), Estado = 2
                    WHERE Idpagovacas = ?
                `;
                await connection.query(query, [salarioTotal, idencargado, id]);
                await connection.close();

                Swal.fire({
                    icon: 'success',
                    title: 'Autorizado',
                    text: 'El pago ha sido autorizado exitosamente.'
                });

                await ListadopagosporAutorizar();
            }
        } catch (error) {
            console.error('Error saving vacation payment:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al autorizar el pago: ' + error.message
            });
        }
    }

    // Anular pago de vacaciones
    async function AnularPagoVacaciones(id) {
        try {
            const result = await Swal.fire({
                title: '¿Está seguro?',
                text: "Esta acción anulará el pago de vacaciones",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, anular',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                const connection = await odbc.connect(conexion);
                const fechaAnulacion = new Date().toISOString().slice(0, 19).replace('T', ' ');
                
                const query = `
                    UPDATE vacacionespagadas
                    SET Estado = 4, IdPerAutAnu = ?, FechaAutAnu = ?
                    WHERE Idpagovacas = ?
                `;
                await connection.query(query, [idencargado, fechaAnulacion, id]);
                await connection.close();

                Swal.fire(
                    'Anulado',
                    'El pago de vacaciones ha sido anulado.',
                    'success'
                );

                await ListadopagosporAutorizar();
            }
        } catch (error) {
            console.error('Error anulando pago de vacaciones:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al anular el pago de vacaciones.'
            });
        }
    }

    // Iniciar carga de datos
    await ListadopagosporAutorizar();
});