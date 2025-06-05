
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
  
  const pivInstallDate = panel.piv_instalado && isValidDateString(panel.piv_instalado) ? parseDate(panel.piv_instalado) : null;
  const pivDesinstallDate = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const pivReinstallDate = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // Regla: Si "PIV Instalado" (panel.piv_instalado) está vacío o no es una fecha válida → No facturar nunca
  if (!pivInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] PIV Billing: No valid piv_instalado date. Billable days: 0.`);
    return 0;
  }

  // console.log(`[Panel ${panel.codigo_parada}] PIV Billing for ${year}-${String(month).padStart(2,'0')}: (Natural Days In Month: ${actualDaysInBillingMonth})`, {
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

    // Panel debe estar al menos en o después de la fecha de pivInstallDate
    if (currentDate >= pivInstallDate) {
        isEffectivelyInstalledToday = true; // Activo por defecto si estamos después de la instalación inicial

        // Si hay fecha de desinstalación PIV válida Y es igual o posterior a la instalación PIV...
        if (pivDesinstallDate && pivDesinstallDate >= pivInstallDate) {
            // Y la fecha actual es posterior al día de desinstalación PIV...
            // (el día de desinstalación SÍ es facturable, por eso usamos >)
            if (currentDate > pivDesinstallDate) {
                isEffectivelyInstalledToday = false; // Inactivo después de la desinstalación

                // Si además hay fecha de reinstalación PIV válida Y es posterior a la desinstalación...
                if (pivReinstallDate && pivReinstallDate > pivDesinstallDate) {
                    // Y la fecha actual es igual o posterior a la reinstalación PIV...
                    if (currentDate >= pivReinstallDate) {
                        isEffectivelyInstalledToday = true; // Activo de nuevo
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
  daysForDailyRateCalculation: number
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
  allEvents: PanelEvent[], // allEvents is not directly used here anymore for day calculation but kept for signature
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    // console.warn(`[BillingCalc] Panel with ID ${panelId} not found.`);
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const actualActivityDays = calculateBillableDaysFromPIVDates(panel, year, month);

  let daysForBillingAndDisplayNumerator: number;
  let daysForBillingAndDisplayDenominator: number;

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
    daysForBillingAndDisplayDenominator = DAYS_IN_STANDARD_MONTH;
  } else {
    daysForBillingAndDisplayNumerator = actualActivityDays;
    daysForBillingAndDisplayDenominator = actualDaysInBillingMonth; 
  }

  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  const amount = calculateProportionalBilling(
                      daysForBillingAndDisplayNumerator,
                      finalBaseAmount,
                      DAYS_IN_STANDARD_MONTH
                    );
  
  // console.log(`[BillingCalc ${panel.codigo_parada}] For ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${actualDaysInBillingMonth}, Num=${daysForBillingAndDisplayNumerator}, Denom=${daysForBillingAndDisplayDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingAndDisplayNumerator,
    totalDaysInMonth: daysForBillingAndDisplayDenominator,
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

    if (pivInstallDateForHist) { // Only proceed if there's an initial PIV install date
        if (currentDate >= pivInstallDateForHist) {
            isBillableTodayBasedOnPIV = true;
            pivDerivedStatusToday = 'installed';

            if (pivDesinstallDateForHist && pivDesinstallDateForHist >= pivInstallDateForHist) {
                if (currentDate > pivDesinstallDateForHist) {
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
        } else { // currentDate < pivInstallDateForHist
             pivDerivedStatusToday = 'pending_installation';
             isBillableTodayBasedOnPIV = false;
        }
    } else { // No valid pivInstallDateForHist
        pivDerivedStatusToday = panel.status || 'unknown'; // Default to panel's current status
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

