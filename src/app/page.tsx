"use client";
import { KeyMetrics } from '@/components/dashboard/key-metrics';
import PageHeader from '@/components/shared/page-header';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Panel de Control" 
        description="Resumen de métricas y actividad de los paneles PIV." 
      />
      <KeyMetrics />
    </div>
  );
}
