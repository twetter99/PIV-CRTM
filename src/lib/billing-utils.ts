
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70; // Importe máximo mensual por PIV
const DAYS_IN_STANDARD_MONTH = 30; // Base para tarifa DIARIA (e.g. 37.70 / 30)

// Helper to check if a string is a valid date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        // console.warn(`isValidDateString: Invalid format for date string (expected YYYY-MM-DD...): ${dateStr}`);
        return false;
    }
    const dateObj = parseISO(dateStr.substring(0,10)); // Parse only the date part for YYYY-MM-DD validation
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === dateStr.substring(0,10);
};

// Helper to parse YYYY-MM-DD string to Date object (UTC to avoid timezone issues with date parts)
const parseDate = (dateString: string): Date => {
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

function calculateBillableDaysFromPIVDates(panel: Panel, year: number, month: number): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1));

  let truePanelInstallDate: Date | null = null;
  // Prioritize piv_instalado for the very first installation event
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) { 
    // Fallback to generic installationDate IF piv_instalado is not available/valid
    // This 'installationDate' comes from "Última instalación/reinstalación" in Excel
    truePanelInstallDate = parseDate(panel.installationDate);
  }

  // Last resort fallback if panel is 'installed' but no explicit PIV dates found for start
  if (!truePanelInstallDate && panel.status === 'installed') {
    console.warn(`[Panel ${panel.codigo_parada}] Status 'installed' pero sin 'piv_instalado' o 'installationDate' válidos. Asumiendo activo desde inicio mes facturación ${formatDateFns(monthStartDateObj, 'yyyy-MM-dd', { locale: es })} para ${year}-${month}. Esto podría no ser preciso si faltan datos PIV históricos.`);
    truePanelInstallDate = monthStartDateObj;
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  console.log(`[Panel ${panel.codigo_parada}] Calculando días facturables para mes ${year}-${month}:`, {
    panel_status: panel.status,
    piv_instalado_raw: panel.piv_instalado,
    piv_desinstalado_raw: panel.piv_desinstalado,
    piv_reinstalado_raw: panel.piv_reinstalado,
    installationDate_raw: panel.installationDate,
    truePanelInstallDate_parsed: truePanelInstallDate ? formatDateFns(truePanelInstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
    desinstallDateObj_parsed: desinstallDateObj ? formatDateFns(desinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
    reinstallDateObj_parsed: reinstallDateObj ? formatDateFns(reinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
  });


  if (!truePanelInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] No se pudo determinar una fecha de instalación efectiva (truePanelInstallDate es null). Días facturables: 0.`);
    return 0;
  }

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    // Check if current date is on or after the primary installation date
    if (currentDate >= truePanelInstallDate) {
      isEffectivelyInstalledToday = true; // Assume installed if past initial install

      // Check if it was desinstalled *at or after* the truePanelInstallDate and *on or before* current date
      if (desinstallDateObj && desinstallDateObj >= truePanelInstallDate && currentDate >= desinstallDateObj) {
        isEffectivelyInstalledToday = false; // It's desinstalled

        // Check if it was reinstalled *after that specific desinstallation* and *on or before* current date
        if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
          isEffectivelyInstalledToday = true; // It's back!
        }
      }
    }
    
    // Additional log for daily status, can be enabled for deep debugging
    // console.log(`[Panel ${panel.codigo_parada}] Day ${formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es })}: Installed = ${isEffectivelyInstalledToday}`);

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
  daysForDailyRate: number, // Typically 30
  actualDaysInBillingMonth: number
): number {
  if (daysInstalled <= 0 || baseMonthlyAmount <= 0) return 0;

  // If installed for the whole month (or more, due to calculation method), charge full base amount
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
  allEvents: PanelEvent[], 
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
     console.warn(`[calculateMonthlyBillingForPanel] Panel con ID ${panelId} no encontrado.`);
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }
  
  // console.log(`[calculateMonthlyBillingForPanel] Processing panel ${panelId} for ${year}-${month}. Panel data:`, panel);

  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0 && MAX_MONTHLY_RATE <= 0) {
     // console.log(`[Panel ${panel.codigo_parada}] No hay tarifa base aplicable (importe_mensual: ${panel.importe_mensual}, MAX_MONTHLY_RATE: ${MAX_MONTHLY_RATE}). Importe: 0.`);
     return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: panel };
  }
  
  const finalBaseAmount = baseMonthlyAmount > 0 ? baseMonthlyAmount : MAX_MONTHLY_RATE;

  const billedDays = calculateBillableDaysFromPIVDates(panel, year, month);
  const amount = calculateProportionalBilling(billedDays, finalBaseAmount, DAYS_IN_STANDARD_MONTH, actualDaysInBillingMonth);
  
  // console.log(`[Panel ${panel.codigo_parada}] Billing Summary: Billed Days: ${billedDays}, Amount: ${amount}, Base: ${finalBaseAmount}`);

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
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1));

  let initialPivInstallForHist: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    initialPivInstallForHist = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    initialPivInstallForHist = parseDate(panel.installationDate);
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
    let statusForDisplayToday: PivPanelStatus = 'unknown';


    if (initialPivInstallForHist && currentDate >= initialPivInstallForHist) {
      statusForDisplayToday = 'installed';
      isBillableToday = true;
      
      if (pivDesinstallForHist && pivDesinstallForHist >= initialPivInstallForHist && currentDate >= pivDesinstallForHist) {
        statusForDisplayToday = 'removed';
        isBillableToday = false;
        
        if (pivReinstallForHist && pivReinstallForHist > pivDesinstallForHist && currentDate >= pivReinstallForHist) {
          statusForDisplayToday = 'installed';
          isBillableToday = true;
        }
      }
    } else if (initialPivInstallForHist && currentDate < initialPivInstallForHist) {
      statusForDisplayToday = 'pending_installation';
    } else { // No PIV install date or before it
      statusForDisplayToday = panel.status || 'unknown'; // Fallback to overall panel status if very early in history or no data
    }

    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd', { locale: es }) === currentDateStr);

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1];
      statusForDisplayToday = latestEventToday.newStatus; // Event status overrides PIV-derived status for display
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = statusTranslations[statusForDisplayToday] || statusForDisplayToday;
       if (statusForDisplayToday === 'pending_installation' && initialPivInstallForHist && currentDate < initialPivInstallForHist) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(initialPivInstallForHist, 'dd/MM/yyyy', { locale: es })})`;
      }
    }

    dailyHistory.push({
      date: currentDateStr,
      status: statusForDisplayToday,
      isBillable: isBillableToday, // Billable is strictly based on PIV cycle
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}

