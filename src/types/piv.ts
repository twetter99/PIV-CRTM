
// src/types/piv.ts
export interface Panel {
  codigo_parada: string; // ID único, ej. "15340"
  piv_instalado: string | null; // Fecha ISO "YYYY-MM-DD" o null, ej. "2013-11-13"
  piv_desinstalado?: string | null; // Fecha ISO "YYYY-MM-DD" o null
  piv_reinstalado?: string | null; // Fecha ISO "YYYY-MM-DD" o null
  importe_mensual: number; // ej. 37.7
  
  // Campos existentes mantenidos y/o renombrados para consistencia
  tipo_piv?: string;
  industrial?: string;
  empresa_concesionaria?: string; 
  municipio_marquesina?: string;  
  codigo_marquesina?: string;
  direccion_cce?: string;       
  vigencia?: string;  
  ultima_instalacion_o_reinstalacion?: string | null; 
  
  // Nuevos campos según especificación
  observaciones?: string;                  
  descripcion_corta?: string;              
  codigo_piv_asignado?: string;            
  op1?: string;                           
  op2?: string;                           
  marquesina_cce?: string;                             
  cambio_ubicacion_reinstalaciones?: string;        
  reinstalacion_vandalizados?: string;              
  garantia_caducada?: string;                       

  // Campos de UI/estado interno
  status?: PanelStatus; 
  notes?: string; // Podría ser obsoleto si 'observaciones' es el principal
  lastStatusUpdate?: string | null; 
  latitude?: number;
  longitude?: number;
  fecha_importacion?: string; 
  importado_por?: string; 
  importe_mensual_original?: string; 
  marquesina?: string; // Campo original, puede ser diferente de marquesina_cce
  cce?: string;        // Campo original, puede ser diferente de marquesina_cce
  installationDate?: string | null;

  [key: string]: any; 
}

export type PanelStatus = 'installed' | 'removed' | 'maintenance' | 'pending_installation' | 'pending_removal' | 'unknown';

export const ALL_PANEL_STATUSES: PanelStatus[] = ['installed', 'removed', 'maintenance', 'pending_installation', 'pending_removal', 'unknown'];


export interface PanelEvent {
  id: string; 
  panelId: string; 
  tipo: "DESINSTALACION" | "REINSTALACION";
  fecha: string; 
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
