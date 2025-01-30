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

    function formatCurrency(amount) {
        return new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('es-GT');
    }

    async function cargarDepartamentosPagosAutorizados() {
        try {
            const connection = await conectar();
            const query = `SELECT Id_Departamento, Nombre FROM departamentos ORDER BY Nombre ASC`;
            const departamentos = await connection.query(query);
            await connection.close();

            const select = document.getElementById('departamento-filter-pagos-autorizados');
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

    async function cargarPagosAutorizados() {
        showLoader();
        try {
            const connection = await conectar();
            
            await cargarDepartamentosPagosAutorizados();
            
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
                    vacacionespagadas.TotalaRecibir,
                    vacacionespagadas.NoRecibo,
                    vacacionespagadas.NoCheque
                FROM vacacionespagadas
                INNER JOIN personal ON vacacionespagadas.IdPersonal = personal.Id
                INNER JOIN planillas ON vacacionespagadas.IdPlanilla = planillas.Id_Planilla
                INNER JOIN departamentos ON vacacionespagadas.IdDepartamento = departamentos.Id_Departamento
                INNER JOIN personal AS encargado ON vacacionespagadas.IdEncargado = encargado.Id
                WHERE vacacionespagadas.Estado = 2
                ORDER BY vacacionespagadas.Idpagovacas DESC
            `;
            const result = await connection.query(query);
            await connection.close();

            // Actualizar contador
            document.getElementById('authorized-count').textContent = result.length;

            const tableBody = document.querySelector('#pagos-autorizados-table tbody');
            
            function renderTable(data) {
                tableBody.innerHTML = '';
                document.getElementById('authorized-count').textContent = data.length;
                
                data.forEach(row => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${row.Idpagovacas}</td>
                        <td>${row.NombreCompleto}</td>
                        <td>${formatDate(row.FechaRegistro)}</td>
                        <td>${row.DiasSolicitado}</td>
                        <td>${row.Periodo}</td>
                        <td>${row.Nombre_Planilla}</td>
                        <td>${row.NombreDepartamento}</td>
                        <td>${row.NombreEncargado}</td>
                        <td class="currency">Q ${formatCurrency(row.TotalaRecibir)}</td>
                        <td>
                            <input type="text" 
                                   class="recibo-input" 
                                   value="${row.NoRecibo || ''}" 
                                   placeholder="No. Recibo">
                        </td>
                        <td>
                            <input type="text" 
                                   class="cheque-input" 
                                   value="${row.NoCheque || ''}" 
                                   placeholder="No. Cheque">
                        </td>
                        <td>
                            <button class="finalizar-pago-button" data-id="${row.Idpagovacas}">
                                <i class="fas fa-check-circle"></i> Finalizar Pago
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(tr);
                });

                // Agregar event listeners a los botones
                document.querySelectorAll('.finalizar-pago-button').forEach(button => {
                    button.addEventListener('click', (event) => {
                        const target = event.target.closest('.finalizar-pago-button');
                        if (target) {
                            finalizarPago(target.dataset.id);
                        }
                    });
                });
            }

            renderTable(result);

            // Event listener para el filtro de departamentos
            document.getElementById('departamento-filter-pagos-autorizados').addEventListener('change', function() {
                const selectedDepartamento = this.value;
                const filteredData = selectedDepartamento 
                    ? result.filter(row => row.Id_Departamento.toString() === selectedDepartamento)
                    : result;
                renderTable(filteredData);
            });

        } catch (error) {
            console.error('Error loading pagos autorizados:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar los pagos autorizados.'
            });
        }
        hideLoader();
    }

    async function finalizarPago(id) {
        try {
            const row = document.querySelector(`button[data-id="${id}"]`).closest('tr');
            const noRecibo = row.querySelector('.recibo-input').value;
            const noCheque = row.querySelector('.cheque-input').value;

            if (!noRecibo || !noCheque) {
                throw new Error('Debe ingresar tanto el No. de Recibo como el No. de Cheque.');
            }

            const result = await Swal.fire({
                title: '¿Está seguro?',
                text: "¿Desea finalizar el pago de vacaciones?",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, finalizar',
                cancelButtonText: 'Cancelar'
            });

            if (result.isConfirmed) {
                const connection = await odbc.connect(conexion);
                const query = `
                    UPDATE vacacionespagadas
                    SET NoCheque = ?, NoRecibo = ?, IdPersonalpago = ?, FechaPago = CURDATE(), Estado = 3
                    WHERE Idpagovacas = ?
                `;
                await connection.query(query, [noCheque, noRecibo, idencargado, id]);
                await connection.close();

                Swal.fire({
                    icon: 'success',
                    title: 'Pago finalizado',
                    text: 'El pago ha sido finalizado exitosamente.'
                });

                await cargarPagosAutorizados();
            }
        } catch (error) {
            console.error('Error finalizando pago:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message || 'Hubo un problema al finalizar el pago.'
            });
        }
    }

    // Iniciar carga de datos
    await cargarPagosAutorizados();
});