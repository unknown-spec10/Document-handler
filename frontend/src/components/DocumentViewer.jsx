import { FileText, Image, Download, ExternalLink } from 'lucide-react';

export default function DocumentViewer({ url, mimeType, filename }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-slate-950 border border-slate-800 rounded-md text-center">
        <FileText className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-300">Document URL unavailable</p>
        <p className="text-xs text-slate-500 mt-1">Failed to generate a secure presigned access URL from S3.</p>
      </div>
    );
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  return (
    <div className="w-full h-full bg-slate-950 border border-slate-800 rounded-md overflow-hidden p-2 flex flex-col">
      {/* Viewer controls bar */}
      <div className="flex justify-between items-center bg-slate-900 px-3 sm:px-4 py-2.5 rounded mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isPdf ? (
            <FileText className="w-4 h-4 text-rose-400 shrink-0" />
          ) : isImage ? (
            <Image className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span className="text-xs font-semibold text-slate-300 truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold px-2 py-1.5 bg-slate-950 rounded border border-slate-800 transition-colors"
            title="Open document in a new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open in Tab</span>
          </a>
          <a
            href={url}
            download={filename}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white font-semibold px-2 py-1.5 bg-slate-950 rounded border border-slate-800 transition-colors"
            title="Download document"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </div>

      {/* Main renderer */}
      <div className="w-full flex-1 flex justify-center items-center bg-slate-900 rounded overflow-hidden">
        {isPdf ? (
          <div className="w-full h-full flex flex-col">
            <iframe
              src={`${url}#toolbar=0`}
              className="w-full flex-1 border-none rounded-t"
              title={filename}
            />
            <div className="bg-slate-950 border-t border-slate-850 px-3 py-2 text-[10px] text-slate-400 flex items-center justify-between gap-2">
              <span className="truncate">Mobile Tip: If document details do not render, tap "Open in Tab"</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 font-bold shrink-0 text-xxs hover:underline"
              >
                Open Tab
              </a>
            </div>
          </div>
        ) : isImage ? (
          <img
            src={url}
            alt={filename}
            className="max-w-full max-h-[600px] object-contain rounded shadow-lg p-2"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <FileText className="w-16 h-16 text-slate-600 mb-4" />
            <p className="text-sm font-semibold text-slate-300">Unsupported display format</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">MIME Type: {mimeType}</p>
            <a
              href={url}
              download={filename}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded shadow transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download file to view</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
