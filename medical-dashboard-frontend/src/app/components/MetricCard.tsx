"use client";
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

type MetricItem = { label: string; value: number | string };

interface MetricCardProps {
  title: string;
  value?: number | string;
  unit?: string;
  trend?: number; // percentual, pode ser positivo/negativo
  color?: string; // tailwind color class opcional
  items?: MetricItem[]; // ranking curto (top N)
}

export default function MetricCard({ title, value, unit, trend, color, items }: MetricCardProps) {
  const formattedValue = typeof value === 'number'
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    : value;

  const TrendIcon = trend !== undefined
    ? (trend > 0 ? <ArrowUpRight className="text-green-500" size={18} /> : trend < 0 ? <ArrowDownRight className="text-red-500" size={18} /> : null)
    : null;

  return (
    <Card className="p-4 rounded-2xl shadow-sm bg-white hover:shadow-md transition">
      <CardContent className="flex flex-col space-y-2">
        <div className="text-sm text-gray-500">{title}</div>
        <div className="flex items-center space-x-2">
          <span className="text-2xl font-semibold text-gray-900">
            {formattedValue} {unit || ''}
          </span>
          {TrendIcon}
        </div>
        {items && items.length > 0 && (
          <ul className="text-xs text-gray-600 mt-2 space-y-1">
            {items.slice(0, 5).map((i, idx) => (
              <li key={idx} className="flex justify-between">
                <span>{i.label}</span>
                <span className="font-medium">{i.value}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}