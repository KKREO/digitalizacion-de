import ReactMarkdown from 'react-markdown';
import { Copy, Download, FileText, Table, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export interface ExtractedData {
  id?: string;
  timestamp?: number;
  title: string;
  summary: string;
  details: { label: string; value: string }[];
  rawMarkdown: string;
}

interface DataViewProps {
  data: ExtractedData;
}

export function DataView({ data }: DataViewProps) {
  const [activeTab, setActiveTab] = useState<'structured' | 'markdown'>('structured');
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data.rawMarkdown);
    setCopied(true);
    toast.success('¡Copiado al portapapeles!');
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadAsTxt = () => {
    const formattedContent = `${data.title}\n${'='.repeat(data.title.length)}\n\n${data.summary}\n\n${'-'.repeat(30)}\n\n${data.rawMarkdown}`;
    const blob = new Blob([formattedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_digitalizacion.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Documento TXT descargado!');
  };

  const downloadAsJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_estructurado.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('¡Archivo JSON estructurado descargado!');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
            {data.title}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed max-w-2xl">
            {data.summary}
          </p>
        </div>
        
        {/* Actions Row */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-slate-200"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copiar Markdown
              </>
            )}
          </button>
          
          <button
            onClick={downloadAsTxt}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-sky-100"
          >
            <Download className="w-3.5 h-3.5" />
            Descargar Plano (TXT)
          </button>

          <button
            onClick={downloadAsJson}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs rounded-xl cursor-pointer transition-all border border-emerald-100"
          >
            <Download className="w-3.5 h-3.5" />
            Estructurado (JSON)
          </button>
        </div>
      </div>

      {/* Tabs list switcher */}
      <div className="flex border-b border-slate-100 pb-px">
        <button
          onClick={() => setActiveTab('structured')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'structured'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Table className="w-4 h-4" />
          Tabla de Datos
        </button>
        
        <button
          onClick={() => setActiveTab('markdown')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === 'markdown'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <FileText className="w-4 h-4" />
          Documento Plano
        </button>
      </div>

      {/* Content wrapper */}
      <div className="pt-2">
        {activeTab === 'structured' ? (
          <div className="border border-slate-150 rounded-xl overflow-hidden divide-y divide-slate-100">
            {data.details && data.details.length > 0 ? (
              data.details.map((detail, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="sm:w-1/3 pr-4 pb-1 sm:pb-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {detail.label}
                    </span>
                  </div>
                  <div className="sm:w-2/3">
                    <span className="text-sm font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {detail.value}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                No hay datos específicos estructurados disponibles para este archivo.
              </div>
            )}
          </div>
        ) : (
          <div className="prose prose-slate prose-sm max-w-none p-5 bg-slate-50 rounded-xl border border-slate-100">
            <ReactMarkdown className="leading-relaxed whitespace-pre-line text-slate-700">
              {data.rawMarkdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
