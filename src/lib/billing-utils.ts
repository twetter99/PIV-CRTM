
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA (e.g. 37.70 / 30)

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
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return false;
    }
    const dateObj = parseISO(dateStr.substring(0,10));
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === dateStr.substring(0,10);
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
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));

  let truePanelInstallDate: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    truePanelInstallDate = parseDate(panel.installationDate);
  } else if (panel.status === 'installed') {
    truePanelInstallDate = monthStartDate; // Fallback for active panels without explicit PIV dates
    // console.warn(`[Pnl: ${panel.codigo_parada}] Status 'installed' pero sin 'piv_instalado' o 'installationDate' válidos. Asumiendo activo desde inicio mes facturación ${formatDate(monthStartDate)}.`);
  }

  if (!truePanelInstallDate) {
    // console.log(`[Pnl: ${panel.codigo_parada}] No se pudo determinar una fecha de instalación efectiva. Días facturables: 0. Status: ${panel.status}, PIV_Inst: ${panel.piv_instalado}, InstDate: ${panel.installationDate}`);
    return 0;
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // console.log(`[Pnl: ${panel.codigo_parada}] CALC DAYS - Billing: ${year}-${month}. TruePanelInstall: ${truePanelInstallDate ? formatDate(truePanelInstallDate) : 'null'}, Desinstall: ${desinstallDateObj ? formatDate(desinstallDateObj) : 'null'}, Reinstall: ${reinstallDateObj ? formatDate(reinstallDateObj) : 'null'}`);

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    if (currentDate >= truePanelInstallDate) {
        isEffectivelyInstalledToday = true; 

        if (desinstallDateObj && currentDate >= desinstallDateObj) {
            isEffectivelyInstalledToday = false;
            if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
                isEffectivelyInstalledToday = true;
            }
        }
    }
    
    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
    // Optional: detailed logging for specific panel troubleshooting
    // if (panel.codigo_parada === '10143' ) { // DEBUG SPECIFIC PANEL
    //    console.log(`[Pnl: ${panel.codigo_parada}] Day ${formatDate(currentDate)}: truePanelInstall=${truePanelInstallDate ? formatDate(truePanelInstallDate) : 'null'}, desinstall=${desinstallDateObj ? formatDate(desinstallDateObj) : 'null'}, reinstall=${reinstallDateObj ? formatDate(reinstallDateObj) : 'null'} => installedToday=${isEffectivelyInstalledToday}, billableDaysSoFar=${billableDays}`);
    // }
  }
  
  // console.log(`[Pnl: ${panel.codigo_parada}] Final Billed Days for ${year}-${month}: ${billableDays}/${actualDaysInBillingMonth}. PIV_Inst: ${panel.piv_instalado}, PIV_Des: ${panel.piv_desinstalado}, PIV_Rein: ${panel.piv_reinstalado}`);
  return billableDays;
}


function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number, // This will be MAX_MONTHLY_RATE
  daysForDailyRate: number, // This will be DAYS_IN_STANDARD_MONTH (30)
  actualDaysInBillingMonth: number 
): number {
  if (daysInstalled <= 0 || baseMonthlyAmount <=0) return 0;

  // If installed for the entire actual month, charge the full base monthly amount
  if (daysInstalled >= actualDaysInBillingMonth) {
    return parseFloat(baseMonthlyAmount.toFixed(2));
  }

  const dailyRate = baseMonthlyAmount / daysForDailyRate;
  const proportionalAmount = daysInstalled * dailyRate;

  return parseFloat(proportionalAmount.toFixed(2));
}


export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, // 1-12
  allEvents: PanelEvent[], // Kept for signature compatibility, not directly used for billedDays if PIV dates are primary
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }
  
  // As per requirement, panel.importe_mensual from Excel is ignored for calculation.
  // DataProvider now sets panel.importe_mensual to 0 on import.
  // So, baseMonthlyAmount will always be MAX_MONTHLY_RATE here.
  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual 
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0) {
     return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: panel };
  }

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);
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
    .filter(event => event.panelId === panelId && isValidDateString(event.date))
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));

  // Determine truePanelInstallDate for historical context
  let truePanelInstallDateForHist: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDateForHist = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    truePanelInstallDateForHist = parseDate(panel.installationDate);
  } else if (panel.status === 'installed') {
    truePanelInstallDateForHist = monthStartDate;
  }
  
  const desinstallPiv = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallPiv = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // Determine status at the very beginning of the month
  let statusAtMonthStart: PivPanelStatus = panel.status || 'unknown'; // Default to general panel status
  if (truePanelInstallDateForHist) {
      if (truePanelInstallDateForHist < monthStartDate) { // Installed before this month
          statusAtMonthStart = 'installed';
          if (desinstallPiv && desinstallPiv < monthStartDate) {
              statusAtMonthStart = 'removed';
              if (reinstallPiv && reinstallPiv > desinstallPiv && reinstallPiv < monthStartDate) {
                  statusAtMonthStart = 'installed';
              }
          }
      } else { // Installation is within or after this month starts
          statusAtMonthStart = 'pending_installation';
      }
  }
  
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDate);
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
    const currentDateStr = formatDate(currentDate);
    let eventNotesForDay = "";
    
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';
    if (truePanelInstallDateForHist && currentDate >= truePanelInstallDateForHist) {
        pivDerivedStatusToday = 'installed';
        if (desinstallPiv && currentDate >= desinstallPiv) {
            pivDerivedStatusToday = 'removed';
            if(reinstallPiv && reinstallPiv > desinstallPiv && currentDate >= reinstallPiv) {
                pivDerivedStatusToday = 'installed';
            }
        }
    } else if (truePanelInstallDateForHist && currentDate < truePanelInstallDateForHist){
         pivDerivedStatusToday = 'pending_installation';
    } else {
         pivDerivedStatusToday = panel.status || 'unknown'; // Fallback
    }
    
    let finalStatusForDayDisplay = pivDerivedStatusToday;
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDate(parseDate(event.date)) === currentDateStr);
    if (eventsOnThisDay.length > 0) {
      finalStatusForDayDisplay = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus;
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = finalStatusForDayDisplay !== 'unknown' ? `Estado PIV: ${statusTranslations[finalStatusForDayDisplay]}` : 'Sin evento específico';
      if (finalStatusForDayDisplay === 'installed' && currentDate < (truePanelInstallDateForHist || new Date(0))) {
        // If PIV says installed but it's before the actual known installation date, it's more like pending
        finalStatusForDayDisplay = 'pending_installation';
        eventNotesForDay = "Pendiente según fecha PIV principal";
      }
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDayDisplay,
      isBillable: pivDerivedStatusToday === 'installed', // Billing decision based on PIV cycle, display might show event overrides
      eventNotes: eventNotesForDay,
    });
    currentStatusForDayDisplay = finalStatusForDayDisplay;
  }
  return dailyHistory;
}

    