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
import type { Panel, PanelStatus } from "@/types/piv";
import { ALL_PANEL_STATUSES } from "@/types/piv";
import { useToast } from "@/hooks/use-toast";

const panelFormSchema = z.object({
  codigo_parada: z.string().min(1, "El ID del panel es obligatorio"),
  municipality: z.string().min(1, "El municipio es obligatorio"),
  client: z.string().min(1, "El cliente es obligatorio"),
  address: z.string().min(1, "La dirección es obligatoria"),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  installationDate: z.string().optional().refine(val => !val || !isNaN(Date.parse(val)), { message: "Formato de fecha inválido (AAAA-MM-DD)" }),
  status: z.enum(ALL_PANEL_STATUSES),
  notes: z.string().optional(),
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
      codigo_parada: panel?.codigo_parada || "",
      municipality: panel?.municipality || "",
      client: panel?.client || "",
      address: panel?.address || "",
      latitude: panel?.latitude || undefined,
      longitude: panel?.longitude || undefined,
      installationDate: panel?.installationDate ? panel.installationDate.split('T')[0] : undefined,
      status: panel?.status || 'pending_installation',
      notes: panel?.notes || "",
    },
  });

  async function onSubmit(data: PanelFormValues) {
    const panelData: Panel = {
        ...data,
        installationDate: data.installationDate || undefined,
    };

    try {
      let result;
      if (isEditing && panel) {
        result = await updatePanel(panel.codigo_parada, panelData);
      } else {
        result = await addPanel(panelData);
      }

      if (result.success) {
        toast({
          title: isEditing ? "Panel Actualizado" : "Panel Añadido",
          description: `El panel ${data.codigo_parada} ha sido ${isEditing ? 'actualizado' : 'añadido'} correctamente.`,
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
            {isEditing ? `Actualizar detalles para el panel ${panel?.codigo_parada}.` : "Introduce los detalles para el nuevo panel."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codigo_parada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID Panel (codigo_parada)</FormLabel>
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
                name="municipality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Municipio</FormLabel>
                    <FormControl>
                      <Input placeholder="ej., Ciudad A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="client"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
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
              name="address"
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
              <FormField
                control={form.control}
                name="installationDate"
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
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Cualquier nota adicional sobre el panel" {...field} />
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
