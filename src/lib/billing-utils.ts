
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA (e.g. 37.70 / 30)

// Helper to check if a string is a valid date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    // Check for YYYY-MM-DD pattern specifically for parsing, tolerant of time part for ISO strings
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        // console.warn(`isValidDateString: Invalid format for date string (expected YYYY-MM-DD...): ${dateStr}`);
        return false;
    }
    const dateObj = parseISO(dateStr.substring(0,10)); // Parse only the date part for YYYY-MM-DD validation
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === dateStr.substring(0,10);
};

// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
// Using parseISO directly as it handles YYYY-MM-DD correctly and returns Date in local timezone,
// but comparisons are done with UTC dates constructed with Date.UTC.
const parseDate = (dateString: string): Date => {
  // Dates from data provider are already YYYY-MM-DD
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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
 * CASOS DE PRUEBA REALES (basado en MAX_MONTHLY_RATE = 37.70 y DAYS_IN_STANDARD_MONTH = 30 para tarifa diaria):
 *
 * CASO 1 - PIV instalado todo el mes:
 * - PIV Instalado: 2024-05-15 (antes del mes)
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Mes de facturación: Junio 2025 (30 días)
 * - Resultado Junio 2025: 30 días facturables = €37,70
 *
 * CASO 2 - PIV desinstalado en el mes:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-20 (No se factura el día 20 en adelante)
 * - Resultado Junio 2025: 19 días facturables (1 al 19) = 19 * (37.70/30) ~= €23.88
 *
 * CASO 3 - PIV desinstalado y reinstalado:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-10 (No se factura del 10 al 24)
 * - PIV Reinstalado: 2025-06-25 (Se factura del 25 en adelante)
 * - Resultado Junio 2025: 9 días (1-9) + 6 días (25-30) = 15 días ~= €18.85
 *
 * CASO 4 - PIV instalado durante el mes:
 * - PIV Instalado: 2025-06-15 (Se factura del 15 en adelante)
 * - Resultado Junio 2025: 16 días (15-30) = 16 * (37.70/30) ~= €20.11
 */
function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1)); // CORREGIDO: Nombre de variable

  let truePanelInstallDate: Date | null = null;

  // Determine truePanelInstallDate (effective installation date for consideration)
  // Priority: piv_instalado > installationDate (if status is installed) > fallback to month start (if status is installed)
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    // Use general installationDate if piv_instalado is not set but this one is
    truePanelInstallDate = parseDate(panel.installationDate);
  } else if (panel.status === 'installed') {
    // Fallback for panels marked 'installed' but missing explicit PIV installation or general installation dates.
    // This is a business assumption: if it's 'installed' it must have been installed by the start of this billing period if no other date is found.
    console.warn(`[Panel ${panel.codigo_parada}] Status 'installed' pero sin 'piv_instalado' o 'installationDate' válidos. Asumiendo activo desde inicio mes facturación ${formatDateFns(monthStartDateObj, 'yyyy-MM-dd', { locale: es })} para ${year}-${month}.`);
    truePanelInstallDate = monthStartDateObj;
  }

  // Parse PIV desinstall and reinstall dates
  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;
  
  // DEBUG LOG (AÑADIDO)
  console.log(`[Panel ${panel.codigo_parada}] Calculando días facturables para ${year}-${month}:`, {
    piv_instalado_raw: panel.piv_instalado,
    piv_desinstalado_raw: panel.piv_desinstalado,
    piv_reinstalado_raw: panel.piv_reinstalado,
    installationDate_raw: panel.installationDate,
    status_panel: panel.status,
    truePanelInstallDate: truePanelInstallDate ? formatDateFns(truePanelInstallDate, 'yyyy-MM-dd') : 'null',
    desinstallDateObj: desinstallDateObj ? formatDateFns(desinstallDateObj, 'yyyy-MM-dd') : 'null',
    reinstallDateObj: reinstallDateObj ? formatDateFns(reinstallDateObj, 'yyyy-MM-dd') : 'null',
  });


  if (!truePanelInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] No se pudo determinar una fecha de instalación efectiva (truePanelInstallDate es null). Días facturables: 0.`);
    return 0;
  }

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    // An PIV is considered active on currentDate if:
    // 1. currentDate is on or after its truePanelInstallDate.
    // 2. AND (
    //      a. It was never desinstalled (desinstallDateObj is null)
    //      OR
    //      b. It was desinstalled, but currentDate is BEFORE desinstallDateObj
    //      OR
    //      c. It was desinstalled (currentDate >= desinstallDateObj), AND
    //         it was reinstalled (reinstallDateObj is not null), AND
    //         reinstallDateObj is AFTER desinstallDateObj, AND
    //         currentDate is ON or AFTER reinstallDateObj.
    //    )

    if (currentDate >= truePanelInstallDate) {
        isEffectivelyInstalledToday = true; // Potentially active

        if (desinstallDateObj) { // If a desinstallation event exists
            if (currentDate >= desinstallDateObj) { // If current day is on or after desinstallation
                isEffectivelyInstalledToday = false; // Assume desinstalled
                if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
                    isEffectivelyInstalledToday = true; // But it was reinstalled after that specific desinstallation
                }
            }
            // If currentDate is before desinstallDateObj, it remains true (installed)
        }
        // If no desinstallDateObj, it remains true (installed)
    }
    
    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  
  // DEBUG LOG (AÑADIDO)
  console.log(`[Panel ${panel.codigo_parada}] Resultado para ${year}-${month}: ${billableDays} días facturables de ${actualDaysInBillingMonth}`);
  return billableDays;
}


function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number, 
  daysForDailyRate: number, 
  actualDaysInBillingMonth: number 
): number {
  if (daysInstalled <= 0 || baseMonthlyAmount <=0) return 0;

  // If installed for the entire actual month (or more, due to calculation quirks if daysForDailyRate differs), charge the full base monthly amount
  if (daysInstalled >= actualDaysInBillingMonth) {
    return parseFloat(baseMonthlyAmount.toFixed(2));
  }

  const dailyRate = baseMonthlyAmount / daysForDailyRate; // e.g., 37.70 / 30
  const proportionalAmount = daysInstalled * dailyRate;

  // Round to 2 decimal places
  return parseFloat(proportionalAmount.toFixed(2));
}


export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[], // Kept for signature compatibility, might be used by getPanelHistoryForBillingMonth
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    // console.log(`[calculateMonthlyBillingForPanel] Panel ${panelId} no encontrado.`);
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }
  
  // As per requirement, panel.importe_mensual from Excel is ignored for calculation
  // (data-provider.tsx sets panel.importe_mensual to 0 on import if it was from Excel).
  // So, baseMonthlyAmount will always be MAX_MONTHLY_RATE here.
  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0 && panel.importe_mensual !== MAX_MONTHLY_RATE)
                              ? panel.importe_mensual // This case should ideally not happen if data_provider forces 0 for excel import
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0) {
    //  console.log(`[Panel ${panel.codigo_parada}] baseMonthlyAmount es <= 0 (${baseMonthlyAmount}). Facturación: 0.`);
     return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: panel };
  }

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);
  const amount = calculateProportionalBilling(billedDays, baseMonthlyAmount, DAYS_IN_STANDARD_MONTH, actualDaysInBillingMonth);

  // console.log(`[Panel ${panel.codigo_parada}] Final Billing Record for ${year}-${month}: BilledDays=${billedDays}, Amount=${amount}, BaseMonthly=${baseMonthlyAmount}`);
  
  // AÑADIDO RETURN FALTANTE
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


export interface DayStatus {
  date: string; // YYYY-MM-DD
  status: PivPanelStatus;
  isBillable: boolean;
  eventNotes?: string;
}

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
    .filter(event => event.panelId === panelId && event.date && isValidDateString(event.date))
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1)); // CORREGIDO: Nombre de variable

  // Determine status at the very beginning of the month by checking PIV dates and last event before the month
  let statusAtMonthStart: PivPanelStatus = panel.status || 'unknown'; // Fallback to overall panel status

  let initialInstallForHist: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    initialInstallForHist = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    initialInstallForHist = parseDate(panel.installationDate);
  }

  const desinstallForHist = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallForHist = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  if (initialInstallForHist) {
      if (initialInstallForHist >= monthStartDateObj) { // Installed within or after this month starts
          statusAtMonthStart = 'pending_installation';
      } else { // Installed before this month
          statusAtMonthStart = 'installed';
          if (desinstallForHist && desinstallForHist < monthStartDateObj) {
              statusAtMonthStart = 'removed';
              if (reinstallForHist && reinstallForHist > desinstallForHist && reinstallForHist < monthStartDateObj) {
                  statusAtMonthStart = 'installed';
              }
          }
      }
  } else if (panel.status === 'installed') { // Fallback if no install dates but status is 'installed'
      statusAtMonthStart = 'installed';
  }
  
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDateObj);
  if (eventsBeforeMonth.length > 0) {
    statusAtMonthStart = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  }

  let currentStatusForDayDisplay = statusAtMonthStart;

  const statusTranslations: Record<PivPanelStatus, string> = {
    installed: "Instalado",
    removed: "Eliminado",
    maintenance: "Mantenimiento",
    pending_installation: "Pendiente Instalación",
    pending_removal: "Pendiente Eliminación",
    unknown: "Desconocido",
  };

  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd');
    let eventNotesForDay = "";
    
    // Determine PIV-derived status for billability and base display
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';
    if (initialInstallForHist && currentDate >= initialInstallForHist) {
        pivDerivedStatusToday = 'installed';
        if (desinstallForHist && currentDate >= desinstallForHist) {
            pivDerivedStatusToday = 'removed';
            if(reinstallForHist && reinstallForHist > desinstallForHist && currentDate >= reinstallForHist) {
                pivDerivedStatusToday = 'installed';
            }
        }
    } else if (initialInstallForHist && currentDate < initialInstallForHist){
         pivDerivedStatusToday = 'pending_installation';
    } else {
         pivDerivedStatusToday = panel.status || 'unknown'; // Fallback if no PIV install history
    }
    
    let finalStatusForDayDisplay = pivDerivedStatusToday; // Start with PIV status
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd') === currentDateStr);
    
    if (eventsOnThisDay.length > 0) {
      // If there's an event on this day, it overrides the PIV-derived status for display
      finalStatusForDayDisplay = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus;
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = finalStatusForDayDisplay !== 'unknown' ? `Estado PIV: ${statusTranslations[finalStatusForDayDisplay]}` : 'Sin evento específico';
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDayDisplay,
      // Billability is strictly based on PIV cycle, not overridden by daily events like 'maintenance' for display
      isBillable: pivDerivedStatusToday === 'installed', 
      eventNotes: eventNotesForDay,
    });
    currentStatusForDayDisplay = finalStatusForDayDisplay; // Carry over for next day's potential "previous status" if no event
  }
  return dailyHistory;
}
