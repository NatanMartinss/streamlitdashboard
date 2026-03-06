'use client';

import { useState } from 'react';
import { dashboardAPI } from '../lib/api';
import { Download, FileText, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface ReportGeneratorProps {
  startDate: string;
  endDate: string;
  className?: string;
}

export default function ReportGenerator({ 
  startDate, 
  endDate, 
  className = '' 
}: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // Ancorar datas ISO (yyyy-MM-dd) no fuso de Brasília para evitar deslocamento
  const toBrazilDate = (isoDateString: string) => new Date(`${isoDateString}T12:00:00-03:00`);

  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);
      setError('');
      
      const blob = await dashboardAPI.generateReport(startDate, endDate);
      
      // Criar URL para download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      
      // Nome do arquivo com data
      const fileName = `relatorio-medico-${format(toBrazilDate(startDate), 'yyyy-MM-dd')}-${format(toBrazilDate(endDate), 'yyyy-MM-dd')}.pdf`;
      a.download = fileName;
      
      // Adicionar ao DOM, clicar e remover
      document.body.appendChild(a);
      a.click();
      
      // Limpar
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error: any) {
      console.error('Erro ao gerar relatório:', error);
      setError('Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Botão Principal */}
      <button
        onClick={handleGenerateReport}
        disabled={isGenerating}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Gerando PDF...
          </>
        ) : (
          <>
            <Download className="h-4 w-4 mr-2" />
            Gerar Relatório PDF
          </>
        )}
      </button>

      {/* Informações do Período */}
      <div className="flex items-center text-sm text-gray-600">
        <Calendar className="h-4 w-4 mr-2" />
        <span>
          Período: {format(toBrazilDate(startDate), 'dd/MM/yyyy')} até {format(toBrazilDate(endDate), 'dd/MM/yyyy')}
        </span>
      </div>

      {/* Card de Informações */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <FileText className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm">
            <h4 className="font-medium text-blue-900 mb-1">
              Sobre o Relatório
            </h4>
            <p className="text-blue-700 mb-2">
              O relatório incluirá todos os dados do dashboard para o período selecionado:
            </p>
            <ul className="text-blue-600 space-y-1 text-xs">
              <li>• KPIs e métricas principais</li>
              <li>• Top médicos por atendimentos</li>
              <li>• Principais CID-10 registrados</li>
              <li>• Especialidades mais procuradas</li>
              <li>• Estatísticas detalhadas</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="text-red-600 text-sm">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Status de Carregamento */}
      {isGenerating && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <Loader2 className="h-4 w-4 text-yellow-600 animate-spin mr-2" />
            <div className="text-yellow-800 text-sm">
              Processando dados e gerando relatório PDF...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}