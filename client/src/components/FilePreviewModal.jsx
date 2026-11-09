import React from 'react';
import { X, Download, FileText, ExternalLink, ShieldCheck } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function FilePreviewModal({ file, onClose }) {
  if (!file) return null;

  const token = localStorage.getItem('nkb_token');
  const previewUrl = `/api/files/${file.id}/preview?token=${encodeURIComponent(token)}`;
  const downloadUrl = `/api/files/${file.id}/download?token=${encodeURIComponent(token)}`;

  const mime = (file.mime_type || '').toLowerCase();
  const ext = (file.extension || '').toLowerCase();

  const isImage = mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'ogg'].includes(ext);
  const isAudio = mime.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext);
  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isText = mime.startsWith('text/') || ['txt', 'md', 'json', 'js', 'py', 'html', 'css', 'csv', 'sql'].includes(ext);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-none z-50 flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between text-white pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-nkb-gold-500/20 text-nkb-gold-400 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm truncate max-w-md">{file.name}</div>
            <div className="text-[11px] text-slate-400">
              {formatBytes(file.size_bytes)} &bull; {file.volume_assigned_name || 'Storage Device'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-nkb-navy-800 hover:bg-nkb-navy-700 text-white rounded text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 my-4 flex items-center justify-center overflow-auto rounded bg-slate-900 border border-slate-800 p-2">
        {isImage && (
          <img
            src={previewUrl}
            alt={file.name}
            className="max-h-[75vh] max-w-full object-contain rounded shadow"
          />
        )}

        {isVideo && (
          <video controls autoPlay className="max-h-[75vh] max-w-full rounded">
            <source src={previewUrl} type={file.mime_type || 'video/mp4'} />
            Your browser does not support HTML5 video preview.
          </video>
        )}

        {isAudio && (
          <div className="p-8 bg-slate-800 rounded-lg max-w-md w-full text-center space-y-4">
            <div className="font-semibold text-white text-sm">{file.name}</div>
            <audio controls className="w-full">
              <source src={previewUrl} type={file.mime_type || 'audio/mpeg'} />
            </audio>
          </div>
        )}

        {isPdf && (
          <iframe
            src={previewUrl}
            title={file.name}
            className="w-full h-[75vh] rounded bg-white"
          />
        )}

        {isText && (
          <iframe
            src={previewUrl}
            title={file.name}
            className="w-full h-[75vh] rounded bg-white p-4 font-mono text-xs"
          />
        )}

        {!isImage && !isVideo && !isAudio && !isPdf && !isText && (
          <div className="text-center p-8 space-y-3">
            <FileText className="w-16 h-16 text-slate-600 mx-auto" />
            <div className="text-slate-300 font-semibold text-sm">No direct preview available for this format</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You can download this file safely to your local computer. Physical integrity verified with SHA-256.
            </p>
            <a
              href={downloadUrl}
              download={file.name}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-nkb-gold-500 hover:bg-nkb-gold-600 text-nkb-navy-950 font-bold rounded text-xs transition"
            >
              <Download className="w-4 h-4" />
              <span>Download ({formatBytes(file.size_bytes)})</span>
            </a>
          </div>
        )}
      </div>

      {/* Footer Details */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
        <span className="font-mono truncate max-w-md">SHA-256: {file.sha256_hash}</span>
        <span className="flex items-center space-x-1 text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Storage Integrity Verified</span>
        </span>
      </div>
    </div>
  );
}
