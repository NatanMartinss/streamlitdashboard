"use client";

import React from "react";
import { cn } from "../lib/utils";

interface ChartCardProps {
  title: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function ChartCard({ title, icon, className, children }: ChartCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg p-4 transition-shadow",
        // Usa tokens globais para respeitar tema e margens
        "bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow,0_1px_3px_rgba(0,0,0,0.08))]",
        className
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-[var(--brand-text)]/90">{title}</h3>
        {icon && <div className="text-gray-500">{icon}</div>}
      </div>
      {children}
    </div>
  );
}