const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', async () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    const idencargado = userData.Id;
    const idDepartamento = userData.Id_Departamento;
    const odbc = require('odbc');
    const conexion = 'DSN=recursos';

    // Funciones auxiliares
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

    function showLoader() {
        document.getElementById('loader-overlay').style.display = 'flex';
    }

    function hideLoader() {
        document.getElementById('loader-overlay').style.display = 'none';
    }

    // Verificar permisos de administrador
    async function verificarPermiso123() {
        try {
            const connection = await odbc.connect(conexion);
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

    // Cargar documentación de vacaciones
    async function DocVacacionesTomadas() {
        showLoader();
        try {
            const connection = await conectar();
            const permiso123 = await verificarPermiso123();
    
            let query;
            let queryParams = [];
    
            if (permiso123) {
                query = `
                    SELECT
                        vacacionestomadas.IdPersonal, 
                        CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                               personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto, 
                        personal.No_DPI, 
                        planillas.Nombre_Planilla,
                        vacacionestomadas.Periodo, 
                        COUNT(*) AS CantidadDatos
                    FROM
                        vacacionestomadas
                        INNER JOIN personal ON vacacionestomadas.IdPersonal = personal.Id
                        INNER JOIN planillas ON vacacionestomadas.IdPlanilla = planillas.Id_Planilla
                    GROUP BY
                        vacacionestomadas.IdPersonal, 
                        vacacionestomadas.Periodo
                `;
            } else {
                query = `
                    SELECT
                        vacacionestomadas.IdPersonal, 
                        CONCAT(personal.Primer_Nombre, ' ', IFNULL(personal.Segundo_Nombre, ''), ' ', 
                               personal.Primer_Apellido, ' ', IFNULL(personal.Segundo_Apellido, '')) AS NombreCompleto, 
                        personal.No_DPI, 
                        planillas.Nombre_Planilla,
                        vacacionestomadas.Periodo, 
                        COUNT(*) AS CantidadDatos
                    FROM
                        vacacionestomadas
                        INNER JOIN personal ON vacacionestomadas.IdPersonal = personal.Id
                        INNER JOIN planillas ON vacacionestomadas.IdPlanilla = planillas.Id_Planilla
                    WHERE
                        vacacionestomadas.IdDepartamento = ?
                    GROUP BY
                        vacacionestomadas.IdPersonal, 
                        vacacionestomadas.Periodo
                `;
                queryParams.push(idDepartamento);
            }
    
            const result = await connection.query(query, queryParams);
            await connection.close();
    
            const tableBody = document.querySelector('#doc-vacaciones-tomadas-table tbody');
            tableBody.innerHTML = '';
    
            result.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${row.IdPersonal}</td>
                    <td>${row.NombreCompleto}</td>
                    <td>${row.No_DPI}</td>
                    <td>${row.Nombre_Planilla}</td>
                    <td>${row.Periodo}</td>
                    <td>${row.CantidadDatos}</td>
                    <td>
                        <button class="generate-btn">
                            <i class="fas fa-file-pdf"></i> Generar
                        </button>
                    </td>
                `;
                const generateBtn = tr.querySelector('.generate-btn');
                generateBtn.addEventListener('click', () => generateVacationDocument(
                    row.IdPersonal, 
                    row.Periodo, 
                    row.NombreCompleto, 
                    row.No_DPI, 
                    row.Nombre_Planilla
                ));
                tableBody.appendChild(tr);
            });
            
            setupDocVacacionesSearch();
        } catch (error) {
            console.error('Error loading vacation documentation:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al cargar la documentación de vacaciones tomadas.'
            });
        }
        hideLoader();
    }

    // Configurar búsqueda
    function setupDocVacacionesSearch() {
        const searchInput = document.getElementById('doc-vacaciones-search');
        searchInput.addEventListener('input', filterDocVacaciones);
    }
    
    function filterDocVacaciones() {
        const searchInput = document.getElementById('doc-vacaciones-search');
        const filter = searchInput.value.toLowerCase();
        const table = document.getElementById('doc-vacaciones-tomadas-table');
        const tr = table.getElementsByTagName('tr');
    
        for (let i = 1; i < tr.length; i++) {
            const td = tr[i].getElementsByTagName('td')[1]; // Índice 1 corresponde a la columna "Nombre Completo"
            if (td) {
                const txtValue = td.textContent || td.innerText;
                if (isFlexibleMatch(txtValue, filter)) {
                    tr[i].style.display = "";
                } else {
                    tr[i].style.display = "none";
                }
            }
        }
    }
    
    function isFlexibleMatch(fullText, searchText) {
        const fullTextLower = fullText.toLowerCase();
        const searchTerms = searchText.toLowerCase().split(/\s+/);
        return searchTerms.every(term => fullTextLower.includes(term));
    }

    // Generar documento PDF
    async function generateVacationDocument(idPersonal, periodo, nombreCompleto, noDPI, nombrePlanilla) {
        try {
            const connection = await odbc.connect(conexion);
            const query = `
                SELECT v.FechasTomadas
                FROM vacacionestomadas v
                WHERE v.IdPersonal = ? AND v.Periodo = ?
                ORDER BY v.FechasTomadas
            `;
            const result = await connection.query(query, [idPersonal, periodo]);
            await connection.close();
    
            if (result.length === 0) {
                throw new Error('No se encontraron datos de vacaciones para este empleado y periodo.');
            }
    
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
    
            doc.setFont("helvetica");
            doc.setFontSize(12);
    
            // Funciones auxiliares para el PDF
            const addHeaderFooter = () => {
                doc.setFontSize(14);
                doc.setFont("helvetica", "bold");
                doc.text(nombrePlanilla.toUpperCase(), 105, 15, { align: "center" });
                doc.setFontSize(10);
                doc.text("DEPARTAMENTO DE RECURSOS HUMANOS", 105, 22, { align: "center" });
                doc.text("FICHA DE CONTROL DE PERÍODO DE VACACIONES", 105, 29, { align: "center" });
                doc.setFont("helvetica", "normal");
                doc.line(20, 31, 190, 31);
            };

            const formatearFecha = (fechaStr) => {
                const [year, month, day] = fechaStr.split('-');
                return `${day}/${month}/${year}`;
            };
    
            // Agregar contenido al PDF
            addHeaderFooter();
            doc.setFontSize(11);
            doc.text("NOMBRE:", 20, 40);
            doc.text(nombreCompleto, 40, 40);
            doc.text("DPI:", 20, 48);
            doc.text(noDPI, 30, 48);
    
            doc.text("PERIODO DE VACACIONES", 20, 60);
            doc.text("DEL:", 20, 68);
            doc.text("AL:", 60, 68);
    
            const [fechaInicio, fechaFin] = periodo.split(' al ');
            doc.text(formatearFecha(fechaInicio), 35, 68);
            doc.text(formatearFecha(fechaFin), 70, 68);
    
            // Tabla de fechas
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text("FECHAS DIAS VACACIONES", 105, 80, { align: "center" });
            doc.line(20, 83, 190, 83);
            doc.text("NO.", 25, 88);
            doc.text("FECHA DESCANSO", 60, 88);
            doc.text("FIRMA COLABORADOR", 140, 88);
            doc.setFont("helvetica", "normal");
            doc.line(20, 91, 190, 91);
    
            let y = 99;
            result.forEach((row, index) => {
                if (y > 260) {
                    doc.addPage();
                    addHeaderFooter();
                    y = 40;
                    doc.setFontSize(11);
                    doc.setFont("helvetica", "bold");
                    doc.text("NO.", 25, y);
                    doc.text("FECHA DESCANSO", 60, y);
                    doc.text("FIRMA COLABORADOR", 140, y);
                    doc.setFont("helvetica", "normal");
                    doc.line(20, y + 3, 190, y + 3);
                    y += 10;
                }
    
                const fecha = new Date(row.FechasTomadas + 'T00:00:00Z');
                const fechaFormateada = fecha.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: 'UTC'
                });
    
                doc.text((index + 1).toString(), 27, y);
                doc.text(fechaFormateada, 62, y);
                doc.line(25, y + 5, 185, y + 5); // Línea para firma
                y += 10;
            });

            // Guardar el PDF
            doc.save(`Vacaciones_${nombreCompleto}_${periodo}.pdf`);
    
            Swal.fire({
                icon: 'success',
                title: 'Documento generado',
                text: 'El documento de vacaciones se ha generado correctamente.'
            });
    
        } catch (error) {
            console.error('Error generating vacation document:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Hubo un problema al generar el documento de vacaciones: ' + error.message
            });
        }
    }

    // Iniciar carga de documentación
    DocVacacionesTomadas();
});