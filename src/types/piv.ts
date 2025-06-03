// src/types/piv.ts
export interface Panel {
  codigo_parada: string; // ID
  municipality: string;
  client: string;
  address: string;
  latitude?: number;
  longitude?: number;
  installationDate?: string; // ISO date string YYYY-MM-DD
  status: PanelStatus;
  notes?: string;
  lastStatusUpdate?: string; // ISO date string YYYY-MM-DD
  // Add other relevant attributes from Excel
  [key: string]: any; // For additional dynamic fields
}

export type PanelStatus = 'installed' | 'removed' | 'maintenance' | 'pending_installation' | 'pending_removal' | 'unknown';

export const ALL_PANEL_STATUSES: PanelStatus[] = ['installed', 'removed', 'maintenance', 'pending_installation', 'pending_removal', 'unknown'];


export interface PanelEvent {
  id: string; // UUID for event
  panelId: string; // Corresponds to Panel.codigo_parada
  date: string; // ISO date string YYYY-MM-DD
  oldStatus?: PanelStatus;
  newStatus: PanelStatus;
  notes?: string;
}

export interface BillingRecord {
  panelId: string;
  year: number;
  month: number; // 1-12
  billedDays: number;
  totalDaysInMonth: number;
  amount: number; // Calculated amount
  panelDetails?: Panel; // Include panel details for display
}
