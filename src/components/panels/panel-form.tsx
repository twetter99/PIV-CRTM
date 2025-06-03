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
  codigo_parada: z.string().min(1, "Panel ID is required"),
  municipality: z.string().min(1, "Municipality is required"),
  client: z.string().min(1, "Client is required"),
  address: z.string().min(1, "Address is required"),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  installationDate: z.string().optional().refine(val => !val || !isNaN(Date.parse(val)), { message: "Invalid date format (YYYY-MM-DD)" }),
  status: z.enum(ALL_PANEL_STATUSES),
  notes: z.string().optional(),
});

type PanelFormValues = z.infer<typeof panelFormSchema>;

interface PanelFormProps {
  panel: Panel | null;
  onClose: () => void;
}

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
      installationDate: panel?.installationDate ? panel.installationDate.split('T')[0] : undefined, // Format for input type="date"
      status: panel?.status || 'pending_installation',
      notes: panel?.notes || "",
    },
  });

  async function onSubmit(data: PanelFormValues) {
    const panelData: Panel = {
        ...data,
        installationDate: data.installationDate || undefined, // Ensure it's undefined if empty for backend
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
          title: isEditing ? "Panel Updated" : "Panel Added",
          description: `Panel ${data.codigo_parada} has been successfully ${isEditing ? 'updated' : 'added'}.`,
        });
        onClose();
      } else {
        toast({
          title: "Error",
          description: result.message || (isEditing ? "Could not update panel." : "Could not add panel."),
          variant: "destructive",
        });
      }
    } catch (error: any) {
       toast({
          title: "Submission Error",
          description: error.message || "An unexpected error occurred.",
          variant: "destructive",
        });
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Panel" : "Add New Panel"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update details for panel ${panel?.codigo_parada}.` : "Enter the details for the new panel."}
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
                    <FormLabel>Panel ID (codigo_parada)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., P001" {...field} disabled={isEditing} />
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
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select panel status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_PANEL_STATUSES.map(s => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>)}
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
                    <FormLabel>Municipality</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., City A" {...field} />
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
                    <FormLabel>Client</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Client X" {...field} />
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
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 123 Main St" {...field} />
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
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="e.g., 34.0522" {...field} />
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
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input type="number" step="any" placeholder="e.g., -118.2437" {...field} />
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
                    <FormLabel>Installation Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Optional. Format: YYYY-MM-DD</FormDescription>
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
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Any additional notes about the panel" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Save Changes" : "Add Panel")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
