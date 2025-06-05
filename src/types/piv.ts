
// src/types/piv.ts
export interface Panel {
  codigo_parada: string; // ID
  municipality: string;
  client: string;
  address: string;
  latitude?: number;
  longitude?: number;
  installationDate?: string | null; // General installation date, can be derived from piv_instalado or ultima_instalacion_o_reinstalacion
  status: PanelStatus;
  notes?: string;
  lastStatusUpdate?: string | null; // ISO date string YYYY-MM-DD

  // New fields from detailed import spec
  codigo_marquesina?: string;
  tipo_piv?: string;
  industrial?: string;
  funcionamiento?: string;
  diagnostico?: string;
  tecnico?: string;
  fecha_importacion?: string; // ISO date string
  importado_por?: string; // User ID or name
  
  // FECHAS PIV PARA FACTURACIÓN
  piv_instalado?: string | null;        // YYYY-MM-DD
  piv_desinstalado?: string | null;     // YYYY-MM-DD  
  piv_reinstalado?: string | null;      // YYYY-MM-DD

  importe_mensual?: number; // Calculated/standardized amount, often 0 initially from import.
  importe_mensual_original?: string; // Raw value from Excel "Facturacion" column

  // Additional fields from user request for mapping
  marquesina?: string;
  vigencia?: string; // Original value from Excel
  empresa_concesionaria?: string; // Original value from Excel, can be same as client
  cce?: string; // From Excel 'Cce'
  ultima_instalacion_o_reinstalacion?: string | null; // YYYY-MM-DD, from Excel


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
