import React from 'react';
import { Database, AlertTriangle, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  isLoading?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Data Available',
  message = 'No active detections found in the database for the selected criteria.',
  actionText = 'View Data Status',
  onAction,
  isLoading = false,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-[#222b3d] bg-[#121722]/60 backdrop-blur-sm min-h-[320px]">
      <div className="w-12 h-12 rounded-lg bg-[#1a2232] border border-[#2a364d] flex items-center justify-center mb-4 text-amber-500">
        {isLoading ? (
          <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
        ) : (
          <Database className="w-6 h-6" />
        )}
      </div>
      <h3 className="text-base font-semibold text-slate-100 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
        {message}
      </p>
      {onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded hover:bg-amber-900/40 transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
