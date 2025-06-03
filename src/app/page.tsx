"use client";
import { KeyMetrics } from '@/components/dashboard/key-metrics';
import PageHeader from '@/components/shared/page-header';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader 
        title="Dashboard" 
        description="Overview of PIV panel metrics and activity." 
      />
      <KeyMetrics />
    </div>
  );
}
