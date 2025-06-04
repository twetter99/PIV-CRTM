// Simular una fila del Excel basada en los datos que compartiste
const testRow = {
  'Código parada': '16722',
  'PIV Instalado': '14-12-12',
  'PIV Desinstalado': '06-05-25',
  'PIV Reinstalado': null
};

// Función de conversión
function convertToYYYYMMDD(dateInput) {
  if (dateInput === null || dateInput === undefined || String(dateInput).trim() === "") {
    return null;
  }
  
  const trimmedDateInput = String(dateInput).trim();
  
  // Manejar formato DD-MM-YY
  const parts = trimmedDateInput.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (parts) {
    let day = parseInt(parts[1], 10);
    let month = parseInt(parts[2], 10);
    let year = parseInt(parts[3], 10);
    
    if (parts[3].length === 2) {
      year = year < 70 ? 2000 + year : 1900 + year;
    }
    
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }
  
  return null;
}

// Procesar las fechas como lo hace data-provider.tsx
const pivInstaladoRaw = testRow['PIV Instalado'];
const piv_instalado_converted = convertToYYYYMMDD(pivInstaladoRaw);

const pivDesinstaladoRaw = testRow['PIV Desinstalado'];
const piv_desinstalado_converted = convertToYYYYMMDD(pivDesinstaladoRaw);

const pivReinstaladoRaw = testRow['PIV Reinstalado'];
const piv_reinstalado_converted = convertToYYYYMMDD(pivReinstaladoRaw);

console.log('=== SIMULACIÓN DE IMPORTACIÓN ===');
console.log('Datos originales:', testRow);
console.log('\nConversión:');
console.log(`PIV Instalado: "${pivInstaladoRaw}" -> "${piv_instalado_converted}"`);
console.log(`PIV Desinstalado: "${pivDesinstaladoRaw}" -> "${piv_desinstalado_converted}"`);
console.log(`PIV Reinstalado: "${pivReinstaladoRaw}" -> "${piv_reinstalado_converted}"`);

// Simular el objeto panel resultante
const panel = {
  codigo_parada: testRow['Código parada'],
  piv_instalado: piv_instalado_converted,
  piv_desinstalado: piv_desinstalado_converted,
  piv_reinstalado: piv_reinstalado_converted
};

console.log('\nPanel resultante:', panel);
