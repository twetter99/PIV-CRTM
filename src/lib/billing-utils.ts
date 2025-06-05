
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
  
  let truePanelInstallDate: Date | null = null;

  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    truePanelInstallDate = parseDate(panel.installationDate);
  }

  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  // console.log(`[Panel ${panel.codigo_parada}] Calculando días PIV para ${year}-${String(month).padStart(2,'0')}: (NatDaysInM: ${actualDaysInBillingMonth})`, {
  //   piv_instalado_raw: panel.piv_instalado,
  //   piv_desinstalado_raw: panel.piv_desinstalado,
  //   piv_reinstalado_raw: panel.piv_reinstalado,
  //   installationDate_raw: panel.installationDate,
  //   truePanelInstallDate_parsed: truePanelInstallDate ? formatDateFns(truePanelInstallDate, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   desinstallDateObj_parsed: desinstallDateObj ? formatDateFns(desinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
  //   reinstallDateObj_parsed: reinstallDateObj ? formatDateFns(reinstallDateObj, 'yyyy-MM-dd', { locale: es }) : 'null',
  // });


  if (!truePanelInstallDate) {
    // console.log(`[Panel ${panel.codigo_parada}] No hay fecha PIV de instalación inicial/general válida. Días facturables: 0.`);
    return 0;
  }

  let billableDays = 0;
  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isEffectivelyInstalledToday = false;

    if (truePanelInstallDate && currentDate >= truePanelInstallDate) {
      isEffectivelyInstalledToday = true;

      if (desinstallDateObj && desinstallDateObj >= truePanelInstallDate) {
        if (currentDate > desinstallDateObj) { 
          isEffectivelyInstalledToday = false;
        }
      }

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

  // console.log(`[Panel ${panel.codigo_parada}] Resultado días PIV para ${year}-${String(month).padStart(2,'0')}: ${billableDays} días activos de ${actualDaysInBillingMonth}`);
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
  allEvents: PanelEvent[],
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigo_parada === panelId);
  const naturalDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    // console.warn(`[calculateMonthlyBillingForPanel] Panel con ID ${panelId} no encontrado.`);
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: naturalDaysInMonth, amount: 0, panelDetails: undefined };
  }

  const actualActivityDays = calculateBillableDaysFromPIVDates(panel, year, month);

  let daysForBillingNumerator: number;      // This will be the numerator for "Días Fact."
  let daysForBillingDenominator: number = naturalDaysInMonth; // Default to natural days for the denominator

  if (actualActivityDays >= naturalDaysInMonth) { // Panel was active for the whole natural month
    daysForBillingNumerator = DAYS_IN_STANDARD_MONTH;    // Numerator is 30
    daysForBillingDenominator = DAYS_IN_STANDARD_MONTH;   // Denominator is also 30 for display
  } else {
    daysForBillingNumerator = actualActivityDays;         // Partial month, use actual activity days for numerator
                                                        // Denominator (daysForBillingDenominator) remains naturalDaysInMonth
  }

  const finalBaseAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;

  const amount = (finalBaseAmount <= 0 || daysForBillingNumerator === 0)
                  ? 0
                  : calculateProportionalBilling(
                      daysForBillingNumerator, // Use the numerator for calculation
                      finalBaseAmount,
                      DAYS_IN_STANDARD_MONTH   // Daily rate denominator is always 30
                    );

  // console.log(`[BillingCalc ${panel.codigo_parada}] Para ${year}-${String(month).padStart(2,'0')}: ActDays=${actualActivityDays}, NatDaysInM=${naturalDaysInMonth}, Num=${daysForBillingNumerator}, Denom=${daysForBillingDenominator}, BaseAmt=${finalBaseAmount.toFixed(2)}, Amount=${amount.toFixed(2)}`);
  
  return {
    panelId,
    year,
    month,
    billedDays: daysForBillingNumerator,
    totalDaysInMonth: daysForBillingDenominator,
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
    let isBillableTodayBasedOnPIV = false;
    let pivDerivedStatusToday: PivPanelStatus = 'unknown';

    if (pivInitialInstallForHist && currentDate >= pivInitialInstallForHist) {
      isBillableTodayBasedOnPIV = true;
      pivDerivedStatusToday = 'installed';

      if (pivDesinstallForHist && pivDesinstallForHist >= pivInitialInstallForHist) {
        if (currentDate > pivDesinstallForHist) {
          isBillableTodayBasedOnPIV = false;
          pivDerivedStatusToday = 'removed';
        }
      }

      if (!isBillableTodayBasedOnPIV && pivReinstallForHist && pivDesinstallForHist && pivReinstallForHist > pivDesinstallForHist) {
         if (currentDate >= pivReinstallForHist) {
          isBillableTodayBasedOnPIV = true;
          pivDerivedStatusToday = 'installed';
        }
      }
    } else if (pivInitialInstallForHist && currentDate < pivInitialInstallForHist) {
      pivDerivedStatusToday = 'pending_installation';
      isBillableTodayBasedOnPIV = false;
    } else {
      pivDerivedStatusToday = panel.status || 'unknown'; // Default to panel's current status if no PIV history applies
      isBillableTodayBasedOnPIV = false; // Not billable if no PIV install date before or on current
    }

    let finalStatusForDisplay = pivDerivedStatusToday;
    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd', { locale: es }) === currentDateStr);

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1];
      finalStatusForDisplay = latestEventToday.newStatus; // Event status overrides PIV-derived status for display
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'Inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
      eventNotesForDay = statusTranslations[finalStatusForDisplay] || finalStatusForDisplay;
      if (finalStatusForDisplay === 'pending_installation' && pivInitialInstallForHist && currentDate < pivInitialInstallForHist) {
          eventNotesForDay = `Pendiente Instalación (Programada: ${formatDateFns(pivInitialInstallForHist, 'dd/MM/yyyy', { locale: es })})`;
      }
    }

    dailyHistory.push({
      date: currentDateStr,
      status: finalStatusForDisplay,
      isBillable: isBillableTodayBasedOnPIV, // Billable status is strictly from PIV dates
      eventNotes: eventNotesForDay,
    });
  }
  return dailyHistory;
}
