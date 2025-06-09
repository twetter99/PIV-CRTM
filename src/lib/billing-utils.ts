
import type { Panel, PanelEvent, PanelStatus as PivPanelStatus } from "@/types/piv";
import { format as formatDateFns, parseISO, isValid, getDaysInMonth as getDaysInActualMonthFns } from 'date-fns';
import { es } from 'date-fns/locale';

const MAX_MONTHLY_RATE = 37.70;
const DAYS_IN_STANDARD_MONTH = 30;

export const isValidDateString = (dateStr: any): dateStr is string => {
    if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
    const datePart = dateStr.trim().substring(0, 10); 
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) { 
        return false;
    }
    const dateObj = parseISO(datePart);
    const isValidDate = isValid(dateObj);
    const isSameWhenFormatted = isValidDate && formatDateFns(dateObj, 'yyyy-MM-dd', { locale: es }) === datePart;
    return isSameWhenFormatted;
};

export const parseAndValidateDate = (dateStr: any): Date | null => {
  if (!isValidDateString(dateStr)) { 
    return null;
  }
  try {
    const datePart = (dateStr as string).trim().substring(0, 10); 
    const [year, month, day] = datePart.split('-').map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day)); 
    if (isValid(date) && 
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 && 
        date.getUTCDate() === day) {
      return date;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
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

export function calculateBillableDaysFromPanelPivDates(
  panel: Panel,
  year: number,
  month: number 
): number {
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  
  // Usar los nombres de campo camelCase de la interfaz Panel actualizada
  const installDate = parseAndValidateDate(panel.fechaInstalacion);
  const desinstallDate = parseAndValidateDate(panel.fechaDesinstalacion);
  const reinstallDate = parseAndValidateDate(panel.fechaReinstalacion);

  if (!installDate) {
    return 0;
  }

  let billableDays = 0;

  for (let day = 1; day <= actualDaysInBillingMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    let isActiveToday = false;

    if (currentDate < installDate) {
        isActiveToday = false;
    } else {
        isActiveToday = true; 
        if (desinstallDate) {
            if (reinstallDate && reinstallDate >= desinstallDate) {
                if (!((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate))) {
                    isActiveToday = false;
                }
            } else {
                if (!(currentDate >= installDate && currentDate <= desinstallDate)) {
                    isActiveToday = false;
                }
            }
        } else if (reinstallDate) {
            if (currentDate < reinstallDate) {
                isActiveToday = false; 
            }
        }
    }
    if (isActiveToday) {
      billableDays++;
    }
  }
  return billableDays;
}

export function calculateMonthlyBillingForPanel(
  panelId: string,
  year: number,
  month: number,
  allEvents: PanelEvent[], 
  allPanels: Panel[]
): BillingRecord {
  const panel = allPanels.find(p => p.codigoParada === panelId); // Usar codigoParada
  const actualDaysInBillingMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));

  if (!panel) {
    return { panelId, year, month, billedDays: 0, totalDaysInMonth: actualDaysInBillingMonth, amount: 0, panelDetails: undefined };
  }

  const actualActivityDays = calculateBillableDaysFromPanelPivDates(panel, year, month);
  
  let daysForBillingAndDisplayNumerator: number;
  const daysForBillingAndDisplayDenominator: number = DAYS_IN_STANDARD_MONTH; 

  if (actualActivityDays >= actualDaysInBillingMonth) { 
    daysForBillingAndDisplayNumerator = DAYS_IN_STANDARD_MONTH;
  } else {
    daysForBillingAndDisplayNumerator = actualActivityDays;
  }
  
  // Usar importeMensual de la interfaz Panel actualizada
  const finalBaseAmount = (panel.importeMensual && panel.importeMensual > 0)
                              ? panel.importeMensual 
                              : MAX_MONTHLY_RATE;
  
  const dailyRate = finalBaseAmount / DAYS_IN_STANDARD_MONTH;
  const calculatedAmount = daysForBillingAndDisplayNumerator * dailyRate;
  const amount = parseFloat(calculatedAmount.toFixed(2));
  
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
  const panel = allPanels.find(p => p.codigoParada === panelId); // Usar codigoParada
  if (!panel) return [];

  // Usar los nombres de campo camelCase de la interfaz Panel actualizada
  const installDate = parseAndValidateDate(panel.fechaInstalacion);
  const desinstallDate = parseAndValidateDate(panel.fechaDesinstalacion);
  const reinstallDate = parseAndValidateDate(panel.fechaReinstalacion);

  const actualDaysInMonth = getDaysInActualMonthFns(new Date(Date.UTC(year, month - 1, 1)));
  const dailyHistory: DayStatus[] = [];
  
  const statusTranslations: Record<PivPanelStatus, string> = {
    'installed': 'Instalado',
    'removed': 'Eliminado',
    'maintenance': 'Mantenimiento',
    'pending_installation': 'Pendiente Instalación',
    'pending_removal': 'Pendiente Eliminación',
    'unknown': 'Desconocido'
  };

  for (let day = 1; day <= actualDaysInMonth; day++) {
    const currentDate = new Date(Date.UTC(year, month - 1, day));
    const currentDateStr = formatDateFns(currentDate, 'yyyy-MM-dd', { locale: es });

    let isBillableToday = false;
    let effectiveStatusToday: PivPanelStatus = 'unknown';
    let notesForDay = "";

    if (!installDate) {
        isBillableToday = false;
        effectiveStatusToday = 'unknown';
    } else {
        if (currentDate < installDate) {
            isBillableToday = false;
            effectiveStatusToday = 'pending_installation';
        } else {
            isBillableToday = true; 
            if (desinstallDate) {
                if (reinstallDate && reinstallDate >= desinstallDate) {
                    if (!((currentDate >= installDate && currentDate <= desinstallDate) || (currentDate >= reinstallDate))) {
                        isBillableToday = false;
                    }
                } else {
                    if (!(currentDate >= installDate && currentDate <= desinstallDate)) {
                        isBillableToday = false;
                    }
                }
            } else if (reinstallDate) {
                if (currentDate < reinstallDate) {
                    isBillableToday = false;
                }
            }
            effectiveStatusToday = isBillableToday ? 'installed' : 'removed';
        }
    }
    
    if (effectiveStatusToday === 'pending_installation' && installDate) {
        notesForDay = `${statusTranslations.pending_installation} (Programada: ${formatDateFns(installDate, 'dd/MM/yyyy', { locale: es })})`;
    } else {
        notesForDay = statusTranslations[effectiveStatusToday] || effectiveStatusToday;
    }
    
    if (currentDate.getTime() === installDate?.getTime()) notesForDay = `PIV Instalado (${notesForDay})`;
    if (currentDate.getTime() === desinstallDate?.getTime() && isBillableToday) notesForDay = `PIV Desinstalado - Fin Día (${statusTranslations.installed})`; 
    else if (currentDate.getTime() === desinstallDate?.getTime() && !isBillableToday) notesForDay = `PIV Desinstalado (${statusTranslations.removed})`;
    if (currentDate.getTime() === reinstallDate?.getTime()) notesForDay = `PIV Reinstalado (${notesForDay})`;

    dailyHistory.push({
      date: currentDateStr,
      status: effectiveStatusToday,
      isBillable: isBillableToday,
      eventNotes: notesForDay,
    });
  }
  return dailyHistory;
}
