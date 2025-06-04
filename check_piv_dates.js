const panels = JSON.parse(localStorage.getItem('piv_panels') || '[]');
const panelsWithDates = panels.filter(p => 
  p.piv_instalado || p.piv_desinstalado || p.piv_reinstalado
).slice(0, 5); // Primeros 5 paneles con fechas

console.log("=== VERIFICACIÓN FECHAS PIV ===");
panelsWithDates.forEach(p => {
  console.log(`\nPanel ${p.codigo_parada}:`);
  console.log(`  piv_instalado: ${p.piv_instalado}`);
  console.log(`  piv_desinstalado: ${p.piv_desinstalado}`);
  console.log(`  piv_reinstalado: ${p.piv_reinstalado}`);
});
