import React, { useCallback, useState, useRef } from 'react';
import { Upload, X, FileText, ImageIcon, Camera } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export function FileUploader({ onFileSelect, isLoading }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const triggerCameraSelect = () => {
    cameraInputRef.current?.click();
  };

  const clearFile = () => {
    setSelectedFile(null);
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 md:p-8 transition-colors">
      {!selectedFile ? (
        <div
          className={`flex flex-col items-center justify-center space-y-5 py-6 transition-all rounded-xl ${
            dragActive ? 'bg-slate-100 border-slate-400 scale-[0.99]' : ''
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
            <Upload className="w-8 h-8 text-slate-500" />
          </div>
          <div className="text-center max-w-sm px-4">
            <p className="text-base font-semibold text-slate-800">
              Arrastra tu archivo aquí o elige una opción
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Soporta imágenes (JPG, PNG) y documentos PDF de hasta 20 MB
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md px-4 mt-2">
            {/* Standard File Upload */}
            <button
              onClick={triggerFileSelect}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-medium text-sm rounded-xl cursor-pointer transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4 text-emerald-500" />
              Subir Documento
            </button>

            {/* Direct Camera capture on Mobile */}
            <button
              onClick={triggerCameraSelect}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-50 border border-sky-100 hover:bg-sky-100 text-sky-700 font-medium text-sm rounded-xl cursor-pointer transition-colors disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Tomar Foto (Cámara)
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={handleChange}
            disabled={isLoading}
          />

          <input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={handleChange}
            disabled={isLoading}
          />
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 shadow-sm animate-fade-in">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="p-2.5 bg-slate-50 rounded-lg">
              {selectedFile.type === 'application/pdf' ? (
                <FileText className="w-6 h-6 text-red-500" />
              ) : (
                <ImageIcon className="w-6 h-6 text-indigo-500" />
              )}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          
          <button
            onClick={clearFile}
            disabled={isLoading}
            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
            title="Quitar archivo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
