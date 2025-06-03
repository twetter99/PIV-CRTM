"use client";

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import Link from 'next/link';
import { LayoutDashboard, List, DollarSign, FileText, Menu, BarChartBig } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile'; // Assumes this hook is robust
import { useState, useEffect, ReactNode } from 'react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/panels', label: 'Panels', icon: List },
  { href: '/billing', label: 'Billing', icon: DollarSign },
  { href: '/import-export', label: 'Import/Export', icon: FileText },
];

interface AppSidebarContentProps {
  onLinkClick?: () => void; // For closing mobile sheet
}

function AppSidebarContent({ onLinkClick }: AppSidebarContentProps) {
  const pathname = usePathname();
  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2" onClick={onLinkClick}>
          <BarChartBig className="h-8 w-8 text-primary" />
          <h1 className="text-xl font-bold text-primary font-headline">PIV Manager</h1>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
               <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  onClick={onLinkClick}
                  className="w-full justify-start text-base h-11"
                  isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
                  tooltip={{content: item.label, side: 'right', align: 'center' }}
                >
                  <item.icon className="h-5 w-5 mr-2" />
                  <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        {/* Footer content e.g. version, user */}
      </SidebarFooter>
    </>
  );
}

export default function MainLayout({ children }: { children: ReactNode }) {
  const isMobileView = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // To prevent hydration mismatch and show a loading state for layout
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="sticky top-0 z-50 flex h-16 items-center border-b bg-card px-4 sm:px-6 animate-pulse">
            <div className="h-8 w-32 bg-muted rounded"></div>
        </div>
        <div className="flex flex-1">
          <div className="hidden md:block w-16 md:w-64 bg-muted animate-pulse"></div>
          <div className="flex-1 p-6 bg-background"></div>
        </div>
      </div>
    );
  }

  const handleMobileLinkClick = () => {
    setMobileSheetOpen(false);
  };

  if (isMobileView) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="text-lg font-semibold text-primary font-headline">PIV Manager</span>
          </Link>
          <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-card border-r-0">
               <Sidebar variant="sidebar" collapsible="none" className="h-full border-r-0">
                 <AppSidebarContent onLinkClick={handleMobileLinkClick} />
               </Sidebar>
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 p-4 sm:p-6 bg-background overflow-auto">
          {children}
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen bg-background">
        <Sidebar collapsible="icon" variant="sidebar" className="border-r bg-card text-card-foreground">
          <AppSidebarContent />
        </Sidebar>
        <SidebarInset className="flex flex-col !ml-0 !mt-0 !p-0 !rounded-none !shadow-none">
          {/* Optional Top Bar within main content area if needed, for now content is full height */}
          {/* <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-card px-6">
             <SidebarTrigger className="md:hidden" /> -> This might be redundant if sidebar is always icon-collapsible
            <div className="flex-1"> Page Title / Breadcrumbs </div>
             User Menu 
          </header> */}
          <main className="flex-1 p-6 bg-background overflow-auto">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
