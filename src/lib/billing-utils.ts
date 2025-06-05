
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70;
const DAYS_IN_STANDARD_MONTH = 30;

// Checks if a string is a valid date in "YYYY-MM-DD" format (first 10 chars)
const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    const datePart = dateStr.substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { // Strict check for YYYY-MM-DD
        return false;
    }
    const dateObj = parseISO(datePart);
    // Ensure that parseISO result matches the input string date part after formatting back
    return isValid(dateObj) && formatDateFns(dateObj, 'yyyy-MM-dd') === datePart;
};

// Parses a "YYYY-MM-DD" string (or "YYYY-MM-DD HH:MM:SS") into a UTC Date object
// Only considers the first 10 characters.
const parseDate = (dateString: string): Date => {
  const datePart = dateString.substring(0, 10); // Extract "YYYY-MM-DD"
  const [year, month, day] = datePart.split('-').map(Number);
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
  
  const pivInstallDate = panel.piv_instalado && isValidDateString(panel.piv_instalado) ? parseDate(panel.piv_instalado) : null;
  const pivDesinstallDate = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const pivReinstallDate = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  if (!pivInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] PIV Billing: No valid piv_instalado date. Billable days: 0.`);
    return 0;
  }

  // console.log(`[Panel ${panel.codigo_parada}] PIV Billing for ${year}-${String(month).padStart(2,'0')}: (Nat Days In Month: ${actualDaysInBillingMonth})`, {
  //   piv_instalado_raw: panel.piv_instalado,
  //   piv_desinstalado_raw: panel.piv_desinstalado,
  //   piv_reinstalado_raw: panel.piv_reinstalado,
  //   parsed_pivInstallDate: pivInstallDate ? formatDateFns(pivInstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   parsed_pivDesinstallDate: pivDesinstallDate ? formatDateFns(pivDesinstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   parsed_pivReinstallDate: pivReinstallDate ? formatDateFns(pivReinstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  // });

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    if (currentDate >= pivInstallDate) {
        isEffectivelyInstalledToday = true; 

        if (pivDesinstallDate && pivDesinstallDate >= pivInstallDate) {
            if (currentDate > pivDesinstallDate) { 
                isEffectivelyInstalledToday = false; 
                if (pivReinstallDate && pivReinstallDate > pivDesinstallDate) {
                    if (currentDate >= pivReinstallDate) {
                        isEffectivelyInstalledToday = true; 
                    }
                }
            }
        }
    }

    if (isEffectivelyInstalledToday) {
      billableDays++;
    }
  }
  // console.log(`[Panel ${panel.codigo_parada}] PIV Billing Result for ${year}-${String(month).padStart(2,'0')}: ${billableDays} active days out of ${actualDaysInBillingMonth}`);
  return billableDays;
}


function calculateProportionalBilling(
  daysToBill: number,
  baseMonthlyAmount: number,
  daysForDailyRateCalculation: number // Should typically be DAYS_IN_STANDARD_MONTH
): number {
  if (daysToBill <= 0 || baseMonthlyAmount <= 0 || daysForDailyRateCalculation <= 0) return 0;

  const dailyRate = baseMonthlyAmount / daysForDailyRateCalculation;
  const proportionalAmount = daysToBill * dailyRate;

  return parseFloat(proportionalAmount.toFixed(2));
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
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const actualActivityDays = calculateBillableDaysFromPIVDates(panel, year, month);

  let daysForBillingNumerator: number;
  let daysForBillingDenominator: number;

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    daysForBillingNumerator = DAYS_IN_STANDARD_MONTH;
    daysForBillingDenominator = DAYS_IN_STANDARD_MONTH; // Show as 30/30 if active all natural days
  } else {
    daysForBillingNumerator = actualActivityDays;
    daysForBillingDenominator = actualDaysInBillingMonth; // Show as X / natural_days if partial
  }

  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  // Amount is calculated based on daysForBillingNumerator and a daily rate derived from DAYS_IN_STANDARD_MONTH
  const amount = calculateProportionalBilling(
                      daysForBillingNumerator,
                      finalBaseAmount,
                      DAYS_IN_STANDARD_MONTH 
                    );
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${actualDaysInBillingMonth}, BillNum=${daysForBillingNumerator}, BillDenom=${daysForBillingDenominator} BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingNumerator, // This is the numerator (e.g., 30 or actual partial days)
    totalDaysInMonth: daysForBillingDenominator, // This is the denominator (e.g., 30 or natural days for partial)
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
  month: number,
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

  const pivInstallDateForHist = panel.piv_instalado && isValidDateString(panel.piv_instalado) ? parseDate(panel.piv_instalado) : null;
  const pivDesinstallDateForHist = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const pivReinstallDateForHist = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

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
    let isBillableTodayBasedOnPIV = false;
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';

    if (pivInstallDateForHist) { 
        if (currentDate >= pivInstallDateForHist) {
            isBillableTodayBasedOnPIV = true;
            pivDerivedStatusToday = 'installed';

            if (pivDesinstallDateForHist && pivDesinstallDateForHist >= pivInstallDateForHist) {
                if (currentDate > pivDesinstallDateForHist) { // Day of deinstall is billable
                    isBillableTodayBasedOnPIV = false;
                    pivDerivedStatusToday = 'removed';

                    if (pivReinstallDateForHist && pivReinstallDateForHist > pivDesinstallDateForHist) {
                        if (currentDate >= pivReinstallDateForHist) {
                            isBillableTodayBasedOnPIV = true;
                            pivDerivedStatusToday = 'installed';
                        }
                    }
                }
            }
        } else { 
             pivDerivedStatusToday = 'pending_installation';
             isBillableTodayBasedOnPIV = false;
        }
    } else { 
        pivDerivedStatusToday = panel.status || 'unknown'; 
        isBillableTodayBasedOnPIV = false;
    }


    let finalStatusForDisplay = pivDerivedStatusToday;
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd', { locale: es }) === currentDateStr);

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1];
      finalStatusForDisplay = latestEventToday.newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'Inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = statusTranslations[finalStatusForDisplay] || finalStatusForDisplay;
      if (finalStatusForDisplay === 'pending_installation' && pivInstallDateForHist && currentDate < pivInstallDateForHist) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(pivInstallDateForHist, 'dd/MM/yyyy', { locale: es })})`;
      }
    }

    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDisplay,
      isBillable: isBillableTodayBasedOnPIV,
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}
