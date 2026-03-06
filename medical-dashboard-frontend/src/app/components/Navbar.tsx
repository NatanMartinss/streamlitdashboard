"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Itens de navegação removidos conforme solicitação
  const navItems: { href: string; label: string }[] = [];

  const roleLabel = user?.role === 'super_admin' ? 'Admin' : user?.role === 'admin' ? 'Gestor' : undefined;
  const formatCompanyName = (name?: string) => {
    if (!name) return 'Empresa';
    const normalized = name.trim();
    return /eccosalva\s+emergencias\s+medicas/i.test(normalized)
      ? 'EccoSalva Emergencias Médicas'
      : normalized;
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-bitcare-dark text-white z-50 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-bitcare-primary" aria-hidden="true" />
          <div>
            <p className="text-xs uppercase tracking-wider opacity-80">Bitcare</p>
            <h1 className="text-sm font-semibold">Dashboard Médico</h1>
          </div>
        </div>

        {/* Nav removida */}

        {/* User */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              {formatCompanyName(user?.company_name)}
              {roleLabel && (
                <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 ring-1 ring-white/20">
                  {roleLabel}
                </span>
              )}
            </p>
          </div>
          <div className="h-8 w-8 rounded-full bg-white/10 ring-1 ring-white/20 flex items-center justify-center text-xs">
            {(user?.full_name ?? "U").substring(0,1)}
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-white/30 hover:border-white/60 transition-colors"
            title="Sair"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </nav>
  );
}