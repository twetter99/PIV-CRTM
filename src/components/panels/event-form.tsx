
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useData } from "@/contexts/data-provider";
import type { PanelEvent, PanelStatus } from "@/types/piv";
import { ALL_PANEL_STATUSES } from "@/types/piv";
import { useToast } from "@/hooks/use-toast";

const eventFormSchema = z.object({
  date: z.string().min(1, "La fecha es obligatoria").refine(val => !isNaN(Date.parse(val)), { message: "Formato de fecha inválido (AAAA-MM-DD)" }),
  oldStatus: z.enum(ALL_PANEL_STATUSES).optional().nullable(), // Allow null or undefined
  newStatus: z.enum(ALL_PANEL_STATUSES),
  notes: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  event: PanelEvent | null;
  panelId: string;
  onClose: () => void;
}

const statusTranslations: Record<PanelStatus, string> = {
  installed: "Instalado",
  removed: "Eliminado",
  maintenance: "Mantenimiento",
  pending_installation: "Pendiente Instalación",
  pending_removal: "Pendiente Eliminación",
  unknown: "Desconocido",
};

const NONE_STATUS_VALUE = "__NONE_STATUS__"; // Special value for "N/A (Inicial)"

export default function EventForm({ event, panelId, onClose }: EventFormProps) {
  const { addPanelEvent, updatePanelEvent } = useData();
  const { toast } = useToast();
  const isEditing = !!event;

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      date: event?.date ? event.date.split('T')[0] : new Date().toISOString().split('T')[0],
      oldStatus: event?.oldStatus || undefined, // Keep as undefined if not present
      newStatus: event?.newStatus || 'installed',
      notes: event?.notes || "",
    },
  });

  async function onSubmit(data: EventFormValues) {
    const eventData: Partial<PanelEvent> = {
      ...data,
      date: data.date,
      oldStatus: data.oldStatus === null ? undefined : data.oldStatus, // Ensure undefined is passed if "N/A"
    };

    try {
      let result;
      if (isEditing && event) {
        result = await updatePanelEvent(event.id, { ...eventData, panelId });
      } else {
        result = await addPanelEvent({ ...eventData, panelId } as PanelEvent);
      }
      
      if (result.success) {
        toast({
          title: isEditing ? "Evento Actualizado" : "Evento Añadido",
          description: `El evento para el panel ${panelId} del ${data.date} ha sido ${isEditing ? 'actualizado' : 'añadido'} correctamente.`,
        });
        onClose();
      } else {
         toast({
          title: "Error",
          description: result.message || (isEditing ? "No se pudo actualizar el evento." : "No se pudo añadir el evento."),
          variant: "destructive",
        });
      }
    } catch (error: any) {
        toast({
          title: "Error de Envío",
          description: error.message || "Ocurrió un error inesperado.",
          variant: "destructive",
        });
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Evento" : "Añadir Nuevo Evento"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Actualizar evento para el panel ${panelId}.` : `Registrar un nuevo cambio de estado para el panel ${panelId}.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha del Evento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="oldStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado Anterior</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(value === NONE_STATUS_VALUE ? undefined : value as PanelStatus)} 
                      value={field.value ?? NONE_STATUS_VALUE} // Use special value if field.value is undefined/null
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar estado anterior (opcional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE_STATUS_VALUE}>N/A (Inicial)</SelectItem>
                        {ALL_PANEL_STATUSES.map(s => <SelectItem key={s} value={s}>{statusTranslations[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado Nuevo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value} required>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar estado nuevo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_PANEL_STATUSES.map(s => <SelectItem key={s} value={s}>{statusTranslations[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Motivo del cambio de estado, detalles, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (isEditing ? "Actualizando..." : "Añadiendo...") : (isEditing ? "Guardar Cambios" : "Añadir Evento")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    