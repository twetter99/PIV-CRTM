
// src/types/piv.ts
export interface Panel {
  codigo_parada: string; // ID único, ej. "15340"
  piv_instalado: string; // Fecha ISO "YYYY-MM-DD", ej. "2013-11-13"
  piv_desinstalado?: string | null; // Fecha ISO "YYYY-MM-DD" o null
  piv_reinstalado?: string | null; // Fecha ISO "YYYY-MM-DD" o null
  importe_mensual: number; // ej. 37.7
  
  // Otros campos del Excel que se almacenarán
  tipo_piv?: string;
  industrial?: string;
  empresa_concesionaria?: string; // Mapeado desde Excel
  municipio_marquesina?: string;  // Mapeado desde Excel
  codigo_marquesina?: string;
  direccion_cce?: string;       // Mapeado desde Excel
  
  // Campos existentes que podrían ser redundantes o necesitar un mapeo claro
  // desde los campos específicos del Excel si se mantienen.
  municipality?: string; // Usar municipio_marquesina
  client?: string;       // Usar empresa_concesionaria
  address?: string;      // Usar direccion_cce
  status?: PanelStatus;  // Se debe derivar del estado de instalación y eventos
  notes?: string;
  lastStatusUpdate?: string | null; // Se debe derivar del último evento o fecha de instalación
  latitude?: number;
  longitude?: number;
  fecha_importacion?: string; // Fecha de cuándo se importó este registro
  importado_por?: string; 
  importe_mensual_original?: string; // Valor original del Excel
  marquesina?: string; // Campo adicional del Excel
  vigencia?: string;   // Campo adicional del Excel
  cce?: string;        // Campo adicional del Excel
  ultima_instalacion_o_reinstalacion?: string | null; // Campo adicional del Excel, formato YYYY-MM-DD
  installationDate?: string | null; // Podría ser piv_instalado o ultima_instalacion_o_reinstalacion

  [key: string]: any; 
}

export type PanelStatus = 'installed' | 'removed' | 'maintenance' | 'pending_installation' | 'pending_removal' | 'unknown';

export const ALL_PANEL_STATUSES: PanelStatus[] = ['installed', 'removed', 'maintenance', 'pending_installation', 'pending_removal', 'unknown'];


export interface PanelEvent {
  id: string; // UUID para el evento en el frontend, o el ID del documento de Firestore
  panelId: string; // Coincide con Panel.codigo_parada
  tipo: "DESINSTALACION" | "REINSTALACION";
  fecha: string; // Fecha ISO "YYYY-MM-DD"
  notes?: string; // Opcional
  
  // Campos de la interfaz anterior que pueden ser útiles para la UI o se pueden omitir
  // si la lógica se basa solo en `tipo` y `fecha`.
  oldStatus?: PanelStatus;
  newStatus?: PanelStatus; 
}

export interface BillingRecord {
  panelId: string;
  year: number;
  month: number; // 1-12
  billedDays: number;
  totalDaysInMonth: number; // Puede ser el estándar 30 o los días reales del mes para la UI
  amount: number; // Calculated amount
  panelDetails?: Panel; // Include panel details for display
}
