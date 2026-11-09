import React from 'react';
import {
  FileText,
  Image,
  Video,
  Music,
  Archive,
  FileCode,
  FileSpreadsheet,
  FileCheck,
  File
} from 'lucide-react';

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === '0' || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const n = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  const i = Math.floor(Math.log(n) / Math.log(k));
  return `${parseFloat((n / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getFileIcon(category, extension = '', className = "w-5 h-5") {
  const cat = (category || '').toUpperCase();
  const ext = (extension || '').toLowerCase().replace('.', '');

  if (cat === 'PHOTOS' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
    return <Image className={`${className} text-emerald-600`} />;
  }
  if (cat === 'VIDEOS' || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return <Video className={`${className} text-indigo-600`} />;
  }
  if (cat === 'AUDIO' || ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) {
    return <Music className={`${className} text-amber-600`} />;
  }
  if (cat === 'ARCHIVES' || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <Archive className={`${className} text-purple-600`} />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <FileSpreadsheet className={`${className} text-emerald-700`} />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) {
    return <FileText className={`${className} text-blue-600`} />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'html', 'css', 'json', 'sql'].includes(ext)) {
    return <FileCode className={`${className} text-amber-700`} />;
  }
  return <File className={`${className} text-slate-500`} />;
}
