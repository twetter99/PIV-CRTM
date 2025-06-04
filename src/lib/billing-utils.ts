
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA

// Helper to format date to YYYY-MM-DD (UTC)
const formatDate = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Helper to check if a string is a valid date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return false;
    }
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date.toISOString().startsWith(dateStr.substring(0,10));
};


export interface BillingRecord {
  panelId: string;
  year: number;
  month: number; // 1-12
  billedDays: number;
  totalDaysInMonth: number;
  amount: number; // Calculated amount in EUR
  panelDetails?: Panel;
}

/**
 * CASOS DE PRUEBA (basado en MAX_MONTHLY_RATE = 37.70 y DAYS_IN_STANDARD_MONTH = 30 para tarifa diaria):
 * - PIV instalado 30 días en un mes de 30 días = €37,70
 * - PIV instalado 15 días en un mes de 30 días = €18,85 (15 * (37.70 / 30))
 * - PIV instalado 1 día en un mes de 30 días = €1,26 (1 * (37.70 / 30))
 * - PIV no instalado (0 días) = €0,00
 * - PIV instalado 31 días en un mes de 31 días = €37,70 (máximo)
 * - PIV instalado 28 días en un mes de 28 días (Feb) = €37.70
 *
 * CASOS DE PRUEBA REALES (ejemplos para Junio = 30 días):
 *
 * CASO 1 - PIV instalado todo el mes:
 * - PIV Instalado: 2024-05-15 (antes del mes)
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 30 días facturables = €37,70
 *
 * CASO 2 - PIV desinstalado en el mes:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-20
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 19 días facturables (del 1 al 19 inclusive) = 19 * (37.70/30) ~= €23.88
 *
 * CASO 3 - PIV desinstalado y reinstalado:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-10
 * - PIV Reinstalado: 2025-06-25
 * - Resultado Junio 2025: 9 días (1-9) + 6 días (25-30) = 15 días ~= €18.85
 *
 * CASO 4 - PIV instalado durante el mes:
 * - PIV Instalado: 2025-06-15
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Resultado Junio 2025: 16 días (15-30) = 16 * (37.70/30) ~= €20.11
 */
export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[], // No longer primary source for billedDays if PIV dates are used
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = new Date(year, month, 0).getDate();

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);

  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  const amount = calculateProportionalBilling(billedDays, baseMonthlyAmount, DAYS_IN_STANDARD_MONTH, actualDaysInBillingMonth);

  return {
    panelId,
    year,
    month,
    billedDays,
    totalDaysInMonth: actualDaysInBillingMonth,
    amount,
    panelDetails: panel,
  };
}

function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number,
  daysForDailyRate: number, // e.g., 30 (DAYS_IN_STANDARD_MONTH)
  actualDaysInBillingMonth: number // e.g., 28, 29, 30, 31
): number {
  if (daysInstalled <= 0) return 0;

  if (daysInstalled >= actualDaysInBillingMonth) {
    return parseFloat(baseMonthlyAmount.toFixed(2));
  }

  const dailyRate = baseMonthlyAmount / daysForDailyRate;
  const proportionalAmount = daysInstalled * dailyRate;

  return parseFloat(proportionalAmount.toFixed(2));
}

function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = new Date(year, month, 0).getDate();

  let effectiveInstallDate: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    effectiveInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.status === 'installed' && panel.installationDate && isValidDateString(panel.installationDate)) {
    effectiveInstallDate = parseDate(panel.installationDate);
    console.log(`PIV ${panel.codigo_parada}: Usando panel.installationDate (${panel.installationDate}) como fallback para fecha de instalación efectiva para ${year}-${month}.`);
  } else if (panel.status === 'installed') {
    console.log(`PIV ${panel.codigo_parada}: Estado 'installed' pero sin fecha de instalación válida (piv_instalado o installationDate) para ${year}-${month}. Asumiendo instalación desde inicio de mes si no hay otras fechas PIV que lo contradigan.`);
    // Si el estado es 'installed' y no tenemos ninguna fecha de instalación explícita,
    // para este mes, podríamos asumir que estaba instalado desde el principio del mes,
    // a menos que una fecha de desinstalación o reinstalación lo modifique.
    // Esto es una suposición; idealmente siempre habría una fecha.
    effectiveInstallDate = new Date(Date.UTC(year, month - 1, 1)); // Asume inicio del mes si status es 'installed' y no hay mejor fecha
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // Si no hay fecha de instalación efectiva después de los fallbacks, no se puede facturar.
  if (!effectiveInstallDate) {
      if(panel.status === 'installed') { // Solo loguea si se esperaba facturación
            console.log(`PIV ${panel.codigo_parada} (${year}-${month}): NO HAY FECHA DE INSTALACIÓN EFECTIVA. Días facturables: 0. Status: ${panel.status}. piv_instalado: ${panel.piv_instalado}, installationDate: ${panel.installationDate}`);
      }
    return 0;
  }

  let billableDays = 0;

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isInstalledOnThisDay = false;

    if (currentDate >= effectiveInstallDate) {
      isInstalledOnThisDay = true; // Potencialmente instalado

      if (desinstallDateObj && currentDate >= desinstallDateObj) {
        isInstalledOnThisDay = false; // Desinstalado en o antes de este día

        if (reinstallDateObj && currentDate >= reinstallDateObj && reinstallDateObj > desinstallDateObj) {
          isInstalledOnThisDay = true; // Reinstalado y la reinstalación es válida
        }
      }
    }

    if (isInstalledOnThisDay) {
      billableDays++;
    }
  }
  
  // Log detallado para cada panel procesado por esta función
  const logParts = [
      `PIV ${panel.codigo_parada} (${year}-${month}):`,
      `Eff.Inst: ${effectiveInstallDate ? formatDate(effectiveInstallDate) : 'N/A'},`,
      `Desinst: ${desinstallDateObj ? formatDate(desinstallDateObj) : 'N/A'},`,
      `Reinst: ${reinstallDateObj ? formatDate(reinstallDateObj) : 'N/A'}.`,
      `ImporteMensualExcel: ${panel.importe_mensual || 'N/A'}.`,
      `PanelStatus: ${panel.status}.`,
      `Días Fact: ${billableDays}/${actualDaysInBillingMonth}.`
  ];
  console.log(logParts.join(' '));

  return billableDays;
}


export interface DayStatus {
  date: string; // YYYY-MM-DD
  status: PivPanelStatus;
  isBillable: boolean;
  eventNotes?: string;
}

// Esta función se usa para la vista de DETALLES, y SÍ debería usar el historial de eventos.
// Su lógica para determinar el estado inicial y los cambios diarios basados en eventos es diferente
// a la lógica de calculateBillableDaysFromPIVDates que se enfoca solo en las fechas PIV para facturación.
export function getPanelHistoryForBillingMonth(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[],
  allPanels: Panel[]
): DayStatus[] {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  if (!panel) return [];

  const panelEventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId)
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()); // Ascendente

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyHistory: DayStatus[] = [];
  let currentStatus: PivPanelStatus = 'unknown'; // Estado inicial por defecto

  const monthStartDate = parseDate(`${year}-${String(month).padStart(2, '0')}-01`);

  // Determinar el estado al inicio del mes (basado en eventos o fechas PIV si no hay eventos)
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDate);
  if (eventsBeforeMonth.length > 0) {
    currentStatus = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  } else {
    // Si no hay eventos ANTES del mes, usar fechas PIV o installationDate para estado inicial
    let initialInstallDate: Date | null = null;
    if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
      initialInstallDate = parseDate(panel.piv_instalado);
    } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
      initialInstallDate = parseDate(panel.installationDate);
    }

    if (initialInstallDate && initialInstallDate < monthStartDate) {
        // Instalado antes del inicio del mes. ¿Fue desinstalado/reinstalado antes del mes?
        let effectiveStatusAtMonthStart: PivPanelStatus = 'installed';
        const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
        const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

        if(desinstallDateObj && desinstallDateObj < monthStartDate) {
            effectiveStatusAtMonthStart = 'removed';
            if(reinstallDateObj && reinstallDateObj > desinstallDateObj && reinstallDateObj < monthStartDate) {
                effectiveStatusAtMonthStart = 'installed';
            }
        }
        currentStatus = effectiveStatusAtMonthStart;
    } else {
        // No instalado antes del inicio del mes o sin fecha clara, podría ser 'pending_installation' o 'unknown'
        // o se instalará durante el mes. La iteración diaria lo capturará.
        // El panel.status original (de "Vigencia") puede ser un buen punto de partida si no hay eventos.
        currentStatus = panel.status || 'unknown';
    }
  }


  const statusTranslations: Record<PivPanelStatus, string> = {
    installed: "Instalado",
    removed: "Eliminado",
    maintenance: "Mantenimiento",
    pending_installation: "Pendiente Instalación",
    pending_removal: "Pendiente Eliminación",
    unknown: "Desconocido",
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = parseDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    const currentDateStr = formatDate(currentDate);
    let eventNotesForDay = "";

    // Aplicar eventos del día
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDate(parseDate(event.date)) === currentDateStr);
    if (eventsOnThisDay.length > 0) {
      currentStatus = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus; // El último evento del día determina el estado
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
        // Si no hay eventos de 'PanelEvent', verificar si las fechas PIV causan un cambio de estado implícito hoy.
        // Esto es más para coherencia visual si la vista de detalles quiere reflejar las fechas PIV.
        // Sin embargo, getPanelHistoryForBillingMonth generalmente se basa en 'PanelEvent'.
        // Por simplicidad, si no hay PanelEvents en el día, el estado no cambia por fechas PIV aquí.
        // El cálculo de facturación principal ya usa calculateBillableDaysFromPIVDates.
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: currentStatus,
      isBillable: currentStatus === 'installed',
      eventNotes: eventNotesForDay || (currentStatus !== 'unknown' ? `Estado: ${statusTranslations[currentStatus]}` : 'Sin evento específico'),
    });
  }
  return dailyHistory;
}

    
