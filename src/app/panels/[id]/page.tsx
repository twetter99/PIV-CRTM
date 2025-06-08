
"use client";
import { useParams } from 'next/navigation';
import { useData } from '@/contexts/data-provider';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit2, PlusCircle, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Panel, PanelEvent, PanelStatus } from '@/types/piv';
import PanelForm from '@/components/panels/panel-form';
import EventForm from '@/components/panels/event-form';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';


export default function PanelDetailPage() {
  const params = useParams();
  const { getPanelById, getEventsForPanel, updatePanelEvent: contextUpdateEvent, deletePanelEvent } = useData();
  const { toast } = useToast();
  const panelId = params.id as string;

  const [panel, setPanel] = useState<Panel | null | undefined>(undefined);
  const [events, setEvents] = useState<PanelEvent[]>([]);
  
  const [isPanelFormOpen, setIsPanelFormOpen] = useState(false);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PanelEvent | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<PanelEvent | null>(null);


  useEffect(() => {
    if (panelId) {
      const currentPanel = getPanelById(panelId);
      setPanel(currentPanel);
      if (currentPanel) {
        setEvents(getEventsForPanel(panelId).sort((a,b) => {
          const dateA = a.date ? parseISO(a.date).getTime() : 0;
          const dateB = b.date ? parseISO(b.date).getTime() : 0;
          return dateB - dateA;
        }));
      }
    }
  }, [panelId, getPanelById, getEventsForPanel]);

  const handlePanelFormClose = () => {
    setIsPanelFormOpen(false);
    if (panelId) setPanel(getPanelById(panelId));
  };

  const handleEventFormOpen = (event: PanelEvent | null = null) => {
    setEditingEvent(event);
    setIsEventFormOpen(true);
  };
  
  const handleEventFormClose = () => {
    setIsEventFormOpen(false);
    setEditingEvent(null);
    if (panelId && panel) setEvents(getEventsForPanel(panelId).sort((a,b) => {
        const dateA = a.date ? parseISO(a.date).getTime() : 0;
        const dateB = b.date ? parseISO(b.date).getTime() : 0;
        return dateB - dateA;
      }));
  };

  const confirmDeleteEvent = (event: PanelEvent) => {
    setEventToDelete(event);
    setShowDeleteConfirm(true);
  };

  const handleDeleteEvent = async () => {
    if (eventToDelete && deletePanelEvent) {
       toast({ title: "Eliminación simulada", description: `Eliminación simulada para evento ${eventToDelete.id}. Implementar eliminación real.`, variant: "destructive" });
    }
    setShowDeleteConfirm(false);
    setEventToDelete(null);
  };

  const formatDateSafe = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      // Ensure the date string is just the date part if it includes time
      const dateOnlyString = dateString.split('T')[0];
      return format(parseISO(dateOnlyString), 'dd/MM/yyyy', { locale: es });
    } catch (error) {
      // console.error("Error formatting date:", dateString, error);
      return 'Fecha Inválida';
    }
  };


  if (panel === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cargando Panel..." actions={<Skeleton className="h-10 w-24" />} />
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
        <Card><CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!panel) {
    return (
      <div>
        <PageHeader title="Panel No Encontrado" />
        <p>El panel con ID "{panelId}" no pudo ser encontrado.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Paneles</Link>
        </Button>
      </div>
    );
  }
  
  const formatStatus = (status: string | null | undefined): string => {
    if (status === null || status === undefined) {
      return 'Desconocido';
    }
    const statusMap: { [key: string]: string } = {
        'installed': 'Instalado',
        'removed': 'Eliminado',
        'maintenance': 'Mantenimiento',
        'pending_installation': 'Pendiente Instalación',
        'pending_removal': 'Pendiente Eliminación',
        'unknown': 'Desconocido'
    };
    return statusMap[status as PanelStatus] || status.toString().replace(/_/g, ' ');
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title={`Panel: ${panel.codigo_parada}`}
        description={panel.address || panel.direccion_cce || panel.municipality || panel.municipio_marquesina || ''}
        actions={
          <Button variant="outline" asChild>
            <Link href="/panels"><ArrowLeft className="mr-2 h-4 w-4" />Volver al Listado</Link>
          </Button>
        }
      />

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="font-headline text-2xl">Detalles del Panel</CardTitle>
            <CardDescription>Municipio: {panel.municipality || panel.municipio_marquesina || 'N/A'} | Cliente: {panel.client || panel.empresa_concesionaria || 'N/A'}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPanelFormOpen(true)}>
            <Edit2 className="mr-2 h-4 w-4" /> Editar Panel
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
          {/* Grupo: Información General y de Identificación */}
          <div className="lg:col-span-1"><strong>ID Panel (Código parada):</strong> {panel.codigo_parada}</div>
          <div className="lg:col-span-1"><strong>Estado:</strong> <Badge variant={panel.status === 'installed' ? 'default' : (panel.status === 'removed' ? 'destructive' : 'secondary')}>{formatStatus(panel.status)}</Badge></div>
          <div className="lg:col-span-1"><strong>Municipio Marquesina:</strong> {panel.municipio_marquesina || panel.municipality || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Dirección CCE:</strong> {panel.direccion_cce || panel.address || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Empresa Concesionaria:</strong> {panel.empresa_concesionaria || panel.client || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Descripción corta:</strong> {panel.descripcion_corta || 'N/A'}</div>
          
          {/* Grupo: Fechas Clave PIV */}
          <div className="lg:col-span-1"><strong>PIV Instalado:</strong> {formatDateSafe(panel.piv_instalado)}</div>
          <div className="lg:col-span-1"><strong>PIV Desinstalado:</strong> {formatDateSafe(panel.piv_desinstalado)}</div>
          <div className="lg:col-span-1"><strong>PIV Reinstalado:</strong> {formatDateSafe(panel.piv_reinstalado)}</div>
          <div className="lg:col-span-1"><strong>Última Instalación/Reinstalación:</strong> {formatDateSafe(panel.ultima_instalacion_reinstalacion || panel.installationDate)}</div>
          <div className="lg:col-span-1"><strong>Última Actualización Estado:</strong> {formatDateSafe(panel.lastStatusUpdate)}</div>
          <div className="lg:col-span-1"><strong>Fecha Importación:</strong> {formatDateSafe(panel.fecha_importacion)}</div>

          {/* Grupo: Detalles Técnicos y Contrato */}
          <div className="lg:col-span-1"><strong>Código PIV Asignado:</strong> {panel.codigo_piv_asignado || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Tipo PIV:</strong> {panel.tipo_piv || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Código Marquesina:</strong> {panel.codigo_marquesina || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Marquesina:</strong> {panel.marquesina || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Industrial:</strong> {panel.industrial || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Vigencia:</strong> {panel.vigencia || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Funcionamiento:</strong> {panel.funcionamiento || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Garantía caducada:</strong> {panel.garantia_caducada || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Latitud:</strong> {panel.latitude || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Longitud:</strong> {panel.longitude || 'N/A'}</div>
          
          {/* Grupo: Información Adicional CCE y Operadores */}
          <div className="lg:col-span-1"><strong>Marquesina CCE:</strong> {panel.marquesina_cce || panel.cce || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Op 1:</strong> {panel.op1 || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Op 2:</strong> {panel.op2 || 'N/A'}</div>

          {/* Grupo: Mantenimiento, Vandalismo y Diagnóstico */}
          <div className="md:col-span-2 lg:col-span-3"><strong>Cambio Ubicación/Reinstalaciones Contrato:</strong> {panel.cambio_ubicacion_reinstalaciones || 'N/A'}</div>
          <div className="md:col-span-2 lg:col-span-3"><strong>Reinstalación Vandalizados:</strong> {panel.reinstalacion_vandalizados || 'N/A'}</div>
          <div className="md:col-span-2 lg:col-span-3"><strong>Diagnóstico:</strong> {panel.diagnostico || 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Técnico:</strong> {panel.tecnico || 'N/A'}</div>
          
          {/* Grupo: Facturación */}
          <div className="lg:col-span-1"><strong>Importe Mensual (Original Excel):</strong> {panel.importe_mensual_original !== undefined && panel.importe_mensual_original !== '' ? panel.importe_mensual_original : 'N/A'}</div>
          <div className="lg:col-span-1"><strong>Importe Mensual (Calculado):</strong> €{panel.importe_mensual?.toFixed(2) || 'N/A'}</div>


          {/* Notas Generales y Observaciones */}
          <div className="md:col-span-2 lg:col-span-3"><strong>Observaciones:</strong> {panel.observaciones || 'N/A'}</div>
          <div className="md:col-span-2 lg:col-span-3"><strong>Notas Generales (Sistema):</strong> {panel.notes || 'N/A'}</div>
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-headline text-2xl">Historial de Eventos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => handleEventFormOpen()}>
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Evento
          </Button>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado Anterior</TableHead>
                    <TableHead>Estado Nuevo</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{formatDateSafe(event.date)}</TableCell>
                      <TableCell><Badge variant="secondary">{event.oldStatus ? formatStatus(event.oldStatus) : 'Inicial'}</Badge></TableCell>
                      <TableCell><Badge variant={event.newStatus === 'installed' ? 'default' : (event.newStatus === 'removed' ? 'destructive' : 'secondary')}>{formatStatus(event.newStatus)}</Badge></TableCell>
                      <TableCell className="max-w-xs truncate">{event.notes || '-'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEventFormOpen(event)} title="Editar Evento">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                         {/* <Button variant="ghost" size="icon" onClick={() => confirmDeleteEvent(event)} title="Eliminar Evento" className="text-destructive hover:text-destructive">
                           <Trash2 className="h-4 w-4" />
                         </Button> */}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No hay eventos registrados para este panel.</p>
          )}
        </CardContent>
      </Card>

      {isPanelFormOpen && <PanelForm panel={panel} onClose={handlePanelFormClose} />}
      {isEventFormOpen && <EventForm event={editingEvent} panelId={panel.codigo_parada} onClose={handleEventFormClose} />}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el evento para el panel
              "{eventToDelete?.panelId}" del {eventToDelete?.date ? formatDateSafe(eventToDelete.date) : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteEvent}>Eliminar Evento</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
