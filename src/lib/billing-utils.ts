
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
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false; // Added trim check
    // Basic check for YYYY-MM-DD format. parseISO will do more thorough validation.
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return false;
    }
    const dateObj = parseISO(dateStr.substring(0,10));
    // Check if the date is valid and if formatting it back gives the same YYYY-MM-dd string
    // This helps catch invalid dates like "2023-02-30"
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
 * - PIV Reinstalado: (vacío)
 * - Mes de facturación: Junio 2025 (30 días)
 * - Resultado Junio 2025: 19 días facturables (1 al 19) = 19 * (37.70/30) ~= €23.88
 *
 * CASO 3 - PIV desinstalado y reinstalado:
 * - PIV Instalado: 2024-05-15
 * - PIV Desinstalado: 2025-06-10 (No se factura del 10 al 24)
 * - PIV Reinstalado: 2025-06-25 (Se factura del 25 en adelante)
 * - Mes de facturación: Junio 2025 (30 días)
 * - Resultado Junio 2025: 9 días (1-9) + 6 días (25-30) = 15 días ~= €18.85
 *
 * CASO 4 - PIV instalado durante el mes:
 * - PIV Instalado: 2025-06-15 (Se factura del 15 en adelante)
 * - PIV Desinstalado: (vacío)
 * - PIV Reinstalado: (vacío)
 * - Mes de facturación: Junio 2025 (30 días)
 * - Resultado Junio 2025: 16 días (15-30) = 16 * (37.70/30) ~= €20.11
 */
function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));

  // Determine the true, earliest installation date to consider for this panel's lifetime
  let truePanelInstallDate: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    // Fallback to general installationDate if piv_instalado is not present/valid
    truePanelInstallDate = parseDate(panel.installationDate);
  } else if (panel.status === 'installed') {
    // If status is 'installed' but no specific install dates are found,
    // assume it was active from the start of the current billing month for this calculation.
    // This prevents losing billing for panels marked 'OK' in Excel without explicit PIV dates.
    truePanelInstallDate = monthStartDate;
    console.warn(`[Pnl: ${panel.codigo_parada}] Status is 'installed' but lacks specific 'piv_instalado' or 'installationDate'. Assuming active from start of billing month ${formatDate(monthStartDate)} for calculation period.`);
  }

  // If no valid installation baseline can be found, it cannot be billed.
  if (!truePanelInstallDate) {
    // console.log(`[Pnl: ${panel.codigo_parada}] No valid overall installation date found (checked piv_instalado, installationDate, and status). Status: ${panel.status}. Billable days: 0.`);
    return 0;
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // console.log(`[Pnl: ${panel.codigo_parada}] Dates for calc (Billing: ${year}-${month}): truePanelInstall='${truePanelInstallDate ? formatDate(truePanelInstallDate) : 'null'}', desinstall='${desinstallDateObj ? formatDate(desinstallDateObj) : 'null'}', reinstall='${reinstallDateObj ? formatDate(reinstallDateObj) : 'null'}'`);

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    // Panel must be past its initial true installation date
    if (currentDate >= truePanelInstallDate) {
        isEffectivelyInstalledToday = true; // Presume installed for the day

        // Check if it's within a desinstallation period
        if (desinstallDateObj && currentDate >= desinstallDateObj) {
            // It is on or after a desinstallation.
            isEffectivelyInstalledToday = false;

            // Check if it was reinstalled *after this desinstallation* and is active again for today.
            if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
                isEffectivelyInstalledToday = true;
            }
        }
    }
    
    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
    // if (panel.codigo_parada === '10143' || panel.codigo_parada === '11476' || panel.codigo_parada === '16722' ) { // DEBUG SPECIFIC PANEL
    //    console.log(`[Pnl: ${panel.codigo_parada}] Day ${formatDate(currentDate)}: truePanelInstallDate=${truePanelInstallDate ? formatDate(truePanelInstallDate) : 'null'}, desinstall=${desinstallDateObj ? formatDate(desinstallDateObj) : 'null'}, reinstall=${reinstallDateObj ? formatDate(reinstallDateObj) : 'null'} => installedToday=${isEffectivelyInstalledToday}, billableDaysSoFar=${billableDays}`);
    // }
  }
  
  // console.log(`[Pnl: ${panel.codigo_parada}] Final Billed Days for ${year}-${month}: ${billableDays}/${actualDaysInBillingMonth}`);
  return billableDays;
}


function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number,
  daysForDailyRate: number, // e.g., 30 (DAYS_IN_STANDARD_MONTH)
  actualDaysInBillingMonth: number // e.g., 28, 29, 30, 31
): number {
  if (daysInstalled <= 0 || baseMonthlyAmount <=0) return 0;

  // If installed for the entire actual month, charge the full base monthly amount
  if (daysInstalled >= actualDaysInBillingMonth) {
    return parseFloat(baseMonthlyAmount.toFixed(2));
  }

  const dailyRate = baseMonthlyAmount / daysForDailyRate;
  const proportionalAmount = daysInstalled * dailyRate;

  return parseFloat(proportionalAmount.toFixed(2)); // Ensure 2 decimal places
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

  // console.log(`[Pnl: ${panelId}] Details for billing: Status='${panel?.status}', ImporteMensual='${panel?.importe_mensual}', PIVInst='${panel?.piv_instalado}', PIVDesinst='${panel?.piv_desinstalado}', PIVReinst='${panel?.piv_reinstalado}', PanelInstDate='${panel?.installationDate}'`);

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0) {
     // console.log(`[Pnl: ${panel.codigo_parada}] Base monthly amount is <= 0 (${baseMonthlyAmount}). Billing 0.`);
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

// This function is used by the billing details page. It should also reflect PIV dates if they are the source of truth.
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
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()); // Ascending for chronological processing

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));

  // Determine initial status at the very beginning of the month using PIV dates primarily
  let statusAtMonthStart: PivPanelStatus = 'unknown';
  let truePanelInstallDateForHist: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDateForHist = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    truePanelInstallDateForHist = parseDate(panel.installationDate);
  } else if (panel.status === 'installed') {
    truePanelInstallDateForHist = monthStartDate; // Assume active from month start if 'installed' and no other dates
  }

  if (truePanelInstallDateForHist && truePanelInstallDateForHist < monthStartDate) {
    statusAtMonthStart = 'installed'; // Installed before this month started
    const desinstallPiv = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
    const reinstallPiv = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

    if (desinstallPiv && desinstallPiv < monthStartDate) {
      statusAtMonthStart = 'removed'; // Was desinstalled before this month
      if (reinstallPiv && reinstallPiv > desinstallPiv && reinstallPiv < monthStartDate) {
        statusAtMonthStart = 'installed'; // And reinstalled before this month
      }
    }
  } else if (truePanelInstallDateForHist && truePanelInstallDateForHist >= monthStartDate) {
    // Installation happens within or after this month starts
    statusAtMonthStart = 'pending_installation';
  } else {
    // No reliable PIV/installation dates, fallback to general panel status from import (e.g. pending_removal, maintenance)
    statusAtMonthStart = panel.status;
  }
  
  // Override with latest event before the month if available
  const eventsBeforeMonth = panelEventsForThisPanel.filter(event => parseDate(event.date) < monthStartDate);
  if (eventsBeforeMonth.length > 0) {
    statusAtMonthStart = eventsBeforeMonth[eventsBeforeMonth.length - 1].newStatus;
  }

  let currentStatusForDay = statusAtMonthStart;

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
    
    // Determine status based on PIV dates for *this specific day*
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';
    if (truePanelInstallDateForHist && currentDate >= truePanelInstallDateForHist) {
        pivDerivedStatusToday = 'installed';
        const desDate = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
        const reinDate = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;
        if (desDate && currentDate >= desDate) {
            pivDerivedStatusToday = 'removed';
            if(reinDate && reinDate > desDate && currentDate >= reinDate) {
                pivDerivedStatusToday = 'installed';
            }
        }
    } else if (truePanelInstallDateForHist && currentDate < truePanelInstallDateForHist){
         pivDerivedStatusToday = 'pending_installation';
    } else {
         pivDerivedStatusToday = panel.status; // Fallback if no effective install date from PIV fields
    }
    
    // Apply PanelEvents for the current day - these can override PIV-derived status for this specific day's log
    // The status for billing is determined by calculateBillableDaysFromPIVDates primarily using PIV dates.
    // This history log can show more granular events.
    let finalStatusForDay = pivDerivedStatusToday; // Start with PIV-derived status

    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDate(parseDate(event.date)) === currentDateStr);
    if (eventsOnThisDay.length > 0) {
      finalStatusForDay = eventsOnThisDay[eventsOnThisDay.length - 1].newStatus; // Last event of the day dictates status
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = finalStatusForDay !== 'unknown' ? `Estado PIV: ${statusTranslations[finalStatusForDay]}` : 'Sin evento específico';
    }
    
    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDay,
      isBillable: finalStatusForDay === 'installed', // Billable if the day's final status is 'installed'
      eventNotes: eventNotesForDay,
    });
    currentStatusForDay = finalStatusForDay; // Carry over to next day's initial evaluation (though PIV dates will re-evaluate)
  }
  return dailyHistory;
}
