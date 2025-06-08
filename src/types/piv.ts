
// src/types/piv.ts
export interface Panel {
  codigo_parada: string;
  piv_instalado: string; // Vuelve a ser string, no string | null
  piv_desinstalado?: string | null;
  piv_reinstalado?: string | null;
  importe_mensual: number;

  // Campos que estaban en la versión estable anterior
  municipality?: string;
  client?: string;
  address?: string;
  status: PanelStatus; // No opcional
  notes?: string;
  lastStatusUpdate: string | null; // No opcional

  marquesina?: string;
  cce?: string;
  ultima_instalacion_o_reinstalacion?: string | null;
  vigencia?: string;

  latitude?: number;
  longitude?: number;
  fecha_importacion?: string;
  importado_por?: string;
  importe_mensual_original?: string;
  installationDate?: string | null;

  [key: string]: any;
}

export type PanelStatus = 'installed' | 'removed' | 'maintenance' | 'pending_installation' | 'pending_removal' | 'unknown';
export const ALL_PANEL_STATUSES: PanelStatus[] = ['installed', 'removed', 'maintenance', 'pending_installation', 'pending_removal', 'unknown'];

export interface PanelEvent {
  id: string;
  panelId: string;
  tipo: "DESINSTALACION" | "REINSTALACION";
  fecha: string; // YYYY-MM-DD
  notes?: string;

  oldStatus?: PanelStatus;
  newStatus?: PanelStatus;
}

export interface BillingRecord {
  panelId: string;
  year: number;
  month: number;
  billedDays: number;
  totalDaysInMonth: number;
  amount: number;
  panelDetails?: Panel;
}
