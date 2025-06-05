
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; 
const DAYS_IN_STANDARD_MONTH = 30; 

const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return false;
    }
    const dateObj = parseISO(dateStr.substring(0,10)); 
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === dateStr.substring(0,10);
};

// Helper to parse 'YYYY-MM-DD' string to a UTC Date object
const parseDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};


export interface BillingRecord {
  panelId: string;
  year: number;
  month: number; 
  billedDays: number;
  totalDaysInMonth: number;
  amount: number; 
  panelDetails?: Panel;
}

function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1));
  // const monthEndDateObj = new Date(Date.UTC(year, month - 1, actualDaysInBillingMonth)); // Not strictly needed for day-by-day iteration

  let truePanelInstallDate: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    // Fallback to general installationDate if piv_instalado is not available/valid
    truePanelInstallDate = parseDate(panel.installationDate);
  }
  // No fallback to monthStartDateObj if no install date; panel needs an explicit start.

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  console.log(`[Panel ${panel.codigo_parada}] Calculando días facturables para mes ${year}-${month}: (Total días en mes: ${actualDaysInBillingMonth})`, {
    panel_status_actual: panel.status,
    piv_instalado_raw: panel.piv_instalado,
    piv_desinstalado_raw: panel.piv_desinstalado,
    piv_reinstalado_raw: panel.piv_reinstalado,
    installationDate_raw: panel.installationDate,
    truePanelInstallDate_parsed: truePanelInstallDate ? formatDateFns(truePanelInstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
    desinstallDateObj_parsed: desinstallDateObj ? formatDateFns(desinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
    reinstallDateObj_parsed: reinstallDateObj ? formatDateFns(reinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
  });

  if (!truePanelInstallDate) {
    console.log(`[Panel ${panel.codigo_parada}] No hay fecha de instalación PIV inicial o general válida. Días facturables: 0.`);
    return 0;
  }

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    if (currentDate >= truePanelInstallDate) { 
      isEffectivelyInstalledToday = true; 

      if (desinstallDateObj && desinstallDateObj >= truePanelInstallDate) {
        // Panel is considered not installed *after* the desinstallation day
        if (currentDate > desinstallDateObj) { // If current day is *after* desinstall day
          isEffectivelyInstalledToday = false; 
        }
      }
      
      // If it was marked as not installed due to a desinstallation, check for reinstallation
      if (!isEffectivelyInstalledToday && reinstallDateObj && desinstallDateObj && reinstallDateObj > desinstallDateObj) {
        if (currentDate >= reinstallDateObj) {
          isEffectivelyInstalledToday = true; 
        }
      }
    }
    
    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  
  console.log(`[Panel ${panel.codigo_parada}] Resultado para mes ${year}-${month}: ${billableDays} días facturables de ${actualDaysInBillingMonth}`);
  return billableDays;
}


function calculateProportionalBilling(
  daysInstalled: number,
  baseMonthlyAmount: number,
  daysForDailyRate: number, 
  actualDaysInBillingMonth: number 
): number {
  if (daysInstalled <= 0 || baseMonthlyAmount <= 0) return 0;

  // If installed for the whole month or more (e.g. 31 days in a 31-day month, or 30 in a 30-day month)
  // the calculation (daysInstalled * dailyRate) should naturally lead to baseMonthlyAmount
  // when dailyRate is baseMonthlyAmount / daysForDailyRate (e.g. 30).
  // No special handling for "full month" is strictly needed if daysForDailyRate is consistent.
  // However, to be safe against floating point issues, if daysInstalled equals actualDaysInBillingMonth
  // AND daysForDailyRate is the standard (e.g. 30), one might return baseMonthlyAmount directly.
  // For now, the direct calculation is preferred for simplicity.

  const dailyRate = baseMonthlyAmount / daysForDailyRate; // e.g., 37.70 / 30
  const proportionalAmount = daysInstalled * dailyRate;

  return parseFloat(proportionalAmount.toFixed(2)); // Round to 2 decimal places
}


export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number, 
  allEvents: PanelEvent[], 
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    console.warn(`[calculateMonthlyBillingForPanel] Panel con ID ${panelId} no encontrado.`);
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }
  
  // Importe mensual se establece en 0 durante la importación, por lo que siempre se usará MAX_MONTHLY_RATE.
  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual // This branch is unlikely if importe_mensual is always imported as 0
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0 && MAX_MONTHLY_RATE <= 0) { // Defensive check
     return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: panel };
  }
  
  const finalBaseAmount = baseMonthlyAmount > 0 ? baseMonthlyAmount : MAX_MONTHLY_RATE;

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);
  const amount = calculateProportionalBilling(billedDays, finalBaseAmount, DAYS_IN_STANDARD_MONTH, actualDaysInBillingMonth);
  
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
  status: PivPanelStatus; // The status to display for this day
  isBillable: boolean; // Based on PIV dates logic
  eventNotes?: string;
}

export function getPanelHistoryForBillingMonth(
  panelId: string,
  year: number,
  month: number, 
  allEvents: PanelEvent[],
  allPanels: Panel[]
): DayStatus[] {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  if (!panel) return [];

  const panelEventsForThisPanel = allEvents
    .filter(event => event.panelId === panelId && event.date && isValidDateString(event.date))
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()); // Sort by date ascending

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1));


  let pivInitialInstallForHist: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    pivInitialInstallForHist = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    pivInitialInstallForHist = parseDate(panel.installationDate);
  }

  const pivDesinstallForHist = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const pivReinstallForHist = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

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
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es });
    
    let eventNotesForDay = "";
    let isBillableToday = false;
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';


    if (pivInitialInstallForHist && currentDate >= pivInitialInstallForHist) {
      pivDerivedStatusToday = 'installed';
      isBillableToday = true;
      
      if (pivDesinstallForHist && pivDesinstallForHist >= pivInitialInstallForHist) {
        if (currentDate > pivDesinstallForHist) { // Panel considered not installed *after* desinstall day
          pivDerivedStatusToday = 'removed';
          isBillableToday = false;
        }
      }
        
      if (!isBillableToday && pivReinstallForHist && pivDesinstallForHist && pivReinstallForHist > pivDesinstallForHist) {
         if (currentDate >= pivReinstallForHist) {
          pivDerivedStatusToday = 'installed';
          isBillableToday = true;
        }
      }
    } else if (pivInitialInstallForHist && currentDate < pivInitialInstallForHist) {
      pivDerivedStatusToday = 'pending_installation';
      isBillableToday = false;
    } else { 
      // If no PIV install date applicable, use panel's current status as a base
      // but it won't be billable unless PIV dates confirm activity in the month.
      pivDerivedStatusToday = panel.status || 'unknown'; 
      isBillableToday = false; // Cannot be billable without a PIV install date for the period
    }

    // Override status for display based on events, but keep isBillable based on PIV cycle
    let finalStatusForDisplay = pivDerivedStatusToday;
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd', { locale: es }) === currentDateStr);

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1]; // Get the last event of the day
      finalStatusForDisplay = latestEventToday.newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'Inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      // If no specific event, use the PIV-derived status for notes.
      eventNotesForDay = statusTranslations[finalStatusForDisplay] || finalStatusForDisplay;
      if (finalStatusForDisplay === 'pending_installation' && pivInitialInstallForHist && currentDate < pivInitialInstallForHist) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(pivInitialInstallForHist, 'dd/MM/yyyy', { locale: es })})`;
      }
    }

    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDisplay,
      isBillable: isBillableToday, 
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}

