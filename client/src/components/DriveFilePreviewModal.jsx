import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Image, FileCode, Copy, Check, Eye } from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import api from '../api/client';

export default function DriveFilePreviewModal({ volumeId, file, onClose }) {
  const [textContent, setTextContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  if (!file || !volumeId) return null;

  const ext = (file.extension || '').toLowerCase().replace('.', '');
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  const isText = ['txt', 'csv', 'json', 'md', 'log', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'py', 'sql', 'xml', 'yml', 'yaml', 'env', 'ini'].includes(ext);

  const token = localStorage.getItem('nkb_token');
  const previewStreamUrl = `/api/storage/volumes/${volumeId}/preview?path=${encodeURIComponent(file.relativePath)}&token=${encodeURIComponent(token || '')}`;
  const downloadUrl = `/api/storage/volumes/${volumeId}/download?path=${encodeURIComponent(file.relativePath)}&token=${encodeURIComponent(token || '')}`;

  useEffect(() => {
    if (isText) {
      setLoading(true);
      setError(null);
      api.get(`/storage/volumes/${volumeId}/preview`, {
        params: { path: file.relativePath }
      })
        .then(res => {
          setTextContent(res.data.content || '');
        })
        .catch(err => {
          setError(err.response?.data?.error || err.message);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [volumeId, file.relativePath, isText]);

  const handleCopy = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 z-50 flex flex-col justify-between p-4 sm:p-6 select-none animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between text-white pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-3 truncate">
          <div className="w-8 h-8 rounded bg-nkb-gold-500/20 text-nkb-gold-400 flex items-center justify-center flex-shrink-0">
            {isImage ? <Image className="w-4 h-4" /> : isText ? <FileCode className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </div>
          <div className="truncate">
            <div className="font-bold text-sm truncate max-w-lg">{file.name}</div>
            <div className="text-[11px] text-slate-400">
              {formatBytes(file.size)} &bull; {file.fileType || 'File'} &bull; <span className="font-mono text-slate-500">{file.relativePath}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {isText && textContent && (
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition"
              title="Copy text to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          )}

          <a
            href={downloadUrl}
            download={file.name}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-nkb-navy-800 hover:bg-nkb-navy-700 text-white rounded text-xs font-semibold transition"
          >
            <Download className="w-3.5 h-3.5 text-nkb-gold-400" />
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
      <div className="flex-1 my-3 flex items-center justify-center overflow-hidden rounded bg-slate-900 border border-slate-800 p-2">
        {isImage && (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            <img
              src={previewStreamUrl}
              alt={file.name}
              className="max-h-[75vh] max-w-full object-contain rounded shadow-lg"
            />
          </div>
        )}

        {isPdf && (
          <div className="w-full h-full bg-slate-800 rounded overflow-hidden">
            <iframe
              src={previewStreamUrl}
              title={file.name}
              className="w-full h-full border-0"
            />
          </div>
        )}

        {isText && (
          <div className="w-full h-full flex flex-col bg-slate-950 rounded border border-slate-800 overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Loading text preview from storage agent...
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-xs text-red-400 p-4">
                Failed to load preview: {error}
              </div>
            ) : (
              <pre className="flex-1 p-4 font-mono text-xs text-slate-200 overflow-auto whitespace-pre-wrap leading-relaxed select-text">
                {textContent || '(Empty file)'}
              </pre>
            )}
          </div>
        )}

        {!isImage && !isPdf && !isText && (
          <div className="text-center text-slate-400 space-y-2 p-8">
            <FileText className="w-12 h-12 text-slate-600 mx-auto" />
            <div className="font-semibold text-sm text-slate-300">Inline Preview Not Supported for this File Type</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              This file ({ext.toUpperCase()}) cannot be safely previewed inline. Click the Download button above to inspect it locally.
            </p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center text-[11px] text-slate-500">
        Read-Only Safe Preview &bull; Streamed securely via Ed25519 authenticated storage agent &bull; NKB Cloud v2.1.0
      </div>
    </div>
  );
}
