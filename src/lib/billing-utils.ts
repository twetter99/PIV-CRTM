
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
  const monthStartDateObj = new Date(Date.UTC(year, month - 1, 1));

  let truePanelInstallDate: Date | null = null;
  if (panel.piv_instalado && isValidDateString(panel.piv_instalado)) {
    truePanelInstallDate = parseDate(panel.piv_instalado);
  } else if (panel.installationDate && isValidDateString(panel.installationDate)) {
    truePanelInstallDate = parseDate(panel.installationDate);
  }
  
  const desinstallDateObj = panel.piv_desinstalado && isValidDateString(panel.piv_desinstalado) ? parseDate(panel.piv_desinstalado) : null;
  const reinstallDateObj = panel.piv_reinstalado && isValidDateString(panel.piv_reinstalado) ? parseDate(panel.piv_reinstalado) : null;

  console.log(`[Panel ${panel.codigo_parada}] Calculando días para ${year}-${month} (Total días en mes: ${actualDaysInBillingMonth})`, {
    panel_status_actual: panel.status,
    piv_instalado_raw: panel.piv_instalado,
    piv_desinstalado_raw: panel.piv_desinstalado,
    piv_reinstalado_raw: panel.piv_reinstalado,
    installationDate_raw: panel.installationDate, // "Última instalación/reinstalación"
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

      if (desinstallDateObj && desinstallDateObj >= truePanelInstallDate && currentDate >= desinstallDateObj) {
        isEffectivelyInstalledToday = false; 
        
        if (reinstallDateObj && reinstallDateObj > desinstallDateObj && currentDate >= reinstallDateObj) {
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
  
  const baseMonthlyAmount = (panel.importe_mensual && panel.importe_mensual > 0)
                              ? panel.importe_mensual
                              : MAX_MONTHLY_RATE;
  
  if (baseMonthlyAmount <= 0 && MAX_MONTHLY_RATE <= 0) {
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
  date: string; 
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
      
      if (pivDesinstallForHist && pivDesinstallForHist >= pivInitialInstallForHist && currentDate >= pivDesinstallForHist) {
        pivDerivedStatusToday = 'removed';
        
        if (pivReinstallForHist && pivReinstallForHist > pivDesinstallForHist && currentDate >= pivReinstallForHist) {
          pivDerivedStatusToday = 'installed';
        }
      }
    } else if (pivInitialInstallForHist && currentDate < pivInitialInstallForHist) {
      pivDerivedStatusToday = 'pending_installation';
    } else { 
      pivDerivedStatusToday = panel.status || 'unknown'; 
    }

    isBillableToday = pivDerivedStatusToday === 'installed';
    let finalStatusForDisplay = pivDerivedStatusToday;

    const eventsOnThisDay = panelEventsForThisPanel.filter(event => formatDateFns(parseDate(event.date), 'yyyy-MM-dd', { locale: es }) === currentDateStr);

    if (eventsOnThisDay.length > 0) {
      const latestEventToday = eventsOnThisDay[eventsOnThisDay.length - 1];
      finalStatusForDisplay = latestEventToday.newStatus; 
      eventNotesForDay = eventsOnThisDay.map(e => e.notes || `${statusTranslations[e.oldStatus || 'unknown'] || 'inicial'} -> ${statusTranslations[e.newStatus]}`).join('; ');
    } else {
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
