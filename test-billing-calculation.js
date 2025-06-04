// Simular las funciones de billing-utils.ts
const getDaysInMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

const parseDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Función simplificada de calculateBillableDaysFromPIVDates
function calculateBillableDays(panel, year, month) {
  const actualDaysInMonth = getDaysInMonth(new Date(year, month - 1, 1));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  
  console.log(`\nCalculando para panel ${panel.codigo_parada} en ${year}-${month}`);
  console.log(`- piv_instalado: ${panel.piv_instalado}`);
  console.log(`- piv_desinstalado: ${panel.piv_desinstalado}`);
  console.log(`- piv_reinstalado: ${panel.piv_reinstalado}`);
  
  if (!panel.piv_instalado) {
    console.log("No hay fecha de instalación");
    return 0;
  }
  
  const installDate = parseDate(panel.piv_instalado);
  const desinstallDate = panel.piv_desinstalado ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDate = panel.piv_reinstalado ? parseDate(panel.piv_reinstalado) : null;
  
  let billableDays = 0;
  
  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isActive = false;
    
    if (currentDate >= installDate) {
      isActive = true;
      
      if (desinstallDate && currentDate >= desinstallDate) {
        isActive = false;
        
        if (reinstallDate && reinstallDate > desinstallDate && currentDate >= reinstallDate) {
          isActive = true;
        }
      }
    }
    
    if (isActive) billableDays++;
  }
  
  console.log(`Resultado: ${billableDays} días facturables de ${actualDaysInMonth}`);
  return billableDays;
}

// Casos de prueba
const testCases = [
  {
    codigo_parada: "TEST1",
    piv_instalado: "2012-05-24",
    piv_desinstalado: "2013-03-26",
    piv_reinstalado: "2013-09-02"
  },
  {
    codigo_parada: "TEST2",
    piv_instalado: "2024-05-15",
    piv_desinstalado: null,
    piv_reinstalado: null
  },
  {
    codigo_parada: "TEST3",
    piv_instalado: "2025-06-15",
    piv_desinstalado: null,
    piv_reinstalado: null
  }
];

console.log("=== PRUEBAS DE CÁLCULO DE DÍAS ===");
testCases.forEach(panel => {
  calculateBillableDays(panel, 2025, 6); // Junio 2025
});
