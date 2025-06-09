
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
import type { Panel, PanelStatus } from "@/types/piv"; // Panel ya usa camelCase
import { ALL_PANEL_STATUSES } from "@/types/piv";
import { useToast } from "@/hooks/use-toast";

// Actualizar schema para usar nombres camelCase
const panelFormSchema = z.object({
  codigoParada: z.string().min(1, "El ID del panel es obligatorio"),
  municipioMarquesina: z.string().min(1, "El municipio es obligatorio"),
  cliente: z.string().min(1, "El cliente es obligatorio"),
  direccion: z.string().min(1, "La dirección es obligatoria"),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  fechaInstalacion: z.string().optional().refine(val => !val || !isNaN(Date.parse(val)), { message: "Formato de fecha inválido (AAAA-MM-DD)" }),
  status: z.enum(ALL_PANEL_STATUSES),
  observaciones: z.string().optional(), // Antes notes, ahora observaciones
  // Añadir otros campos camelCase que se quieran editar en el formulario
  tipoPiv: z.string().optional(),
  industrial: z.string().optional(),
  vigencia: z.string().optional(),
  // ...etc.
});

type PanelFormValues = z.infer<typeof panelFormSchema>;

interface PanelFormProps {
  panel: Panel | null;
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

export default function PanelForm({ panel, onClose }: PanelFormProps) {
  const { addPanel, updatePanel } = useData();
  const { toast } = useToast();
  const isEditing = !!panel;

  const form = useForm<PanelFormValues>({
    resolver: zodResolver(panelFormSchema),
    defaultValues: {
      codigoParada: panel?.codigoParada || "",
      municipioMarquesina: panel?.municipioMarquesina || "",
      cliente: panel?.cliente || "",
      direccion: panel?.direccion || "",
      latitude: panel?.latitude || undefined,
      longitude: panel?.longitude || undefined,
      fechaInstalacion: panel?.fechaInstalacion ? panel.fechaInstalacion.split('T')[0] : undefined,
      status: panel?.status || 'pending_installation',
      observaciones: panel?.observaciones || "",
      tipoPiv: panel?.tipoPiv || "",
      industrial: panel?.industrial || "",
      vigencia: panel?.vigencia || "",
      // ...etc. para otros campos
    },
  });

  async function onSubmit(data: PanelFormValues) {
    // El objeto 'data' ya tiene las claves camelCase del schema
    const panelData: Partial<Panel> = { // Usar Partial<Panel> para flexibilidad
        ...data, 
        // Asegurarse que las fechas opcionales sean undefined si están vacías
        fechaInstalacion: data.fechaInstalacion || undefined, 
    };

    try {
      let result;
      if (isEditing && panel) {
        result = await updatePanel(panel.codigoParada, panelData); // panel.codigoParada para identificar
      } else {
        // Para addPanel, asegurar que todos los campos requeridos por 'Panel' estén presentes
        // Esto podría necesitar un casting o una construcción más cuidadosa si 'Panel' tiene campos obligatorios
        // que no están en PanelFormValues
        result = await addPanel(panelData as Panel); // Puede necesitar ajuste
      }

      if (result.success) {
        toast({
          title: isEditing ? "Panel Actualizado" : "Panel Añadido",
          description: `El panel ${data.codigoParada} ha sido ${isEditing ? 'actualizado' : 'añadido'} correctamente.`,
        });
        onClose();
      } else {
        toast({
          title: "Error",
          description: result.message || (isEditing ? "No se pudo actualizar el panel." : "No se pudo añadir el panel."),
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Panel" : "Añadir Nuevo Panel"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Actualizar detalles para el panel ${panel?.codigoParada}.` : "Introduce los detalles para el nuevo panel."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codigoParada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID Panel (codigoParada)</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., P001" {...field} disabled={isEditing} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar estado del panel" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="municipioMarquesina"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Municipio Marquesina</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., Ciudad A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cliente"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente / Empresa Concesionaria</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., Cliente X" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección</FormLabel>
                  <FormControl>
                    <Input placeholder="ej., C/ Principal 123" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <FormField
                control={form.control}
                name="fechaInstalacion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de Instalación</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Opcional. Formato: AAAA-MM-DD</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitud</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="ej., 34.0522" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitud</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="ej., -118.2437" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
             <FormField
                control={form.control}
                name="tipoPiv"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo PIV</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., Digital" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="industrial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industrial</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., Modelo X" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="vigencia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vigencia</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., 2025" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            <FormField
              control={form.control}
              name="observaciones"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Cualquier observación adicional sobre el panel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (isEditing ? "Actualizando..." : "Añadiendo...") : (isEditing ? "Guardar Cambios" : "Añadir Panel")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
