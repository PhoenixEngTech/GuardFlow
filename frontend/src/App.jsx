import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './Login';
import Tracking from './Tracking';
import VisionFlow from './VisionFlow';
import Operators from './Operators';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  Hash,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Music,
  Paperclip,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Shield,
  UploadCloud,
  UserCheck,
  Users,
  Video,
  X,
} from 'lucide-react';

const API_URL = (
  import.meta.env.VITE_API_URL ||
  'https://guardflow-production.up.railway.app'
).replace(/\/$/, '');

async function readResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

function normaliseList(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return [];
}

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return date.toLocaleString();
}

function formatEventType(eventType) {
  const labels = {
    case_created: 'Case Created',
    case_updated: 'Case Updated',
    status_changed: 'Status Changed',
    operator_reassigned: 'Operator Reassigned',
    evidence_uploaded: 'Evidence Uploaded',
  };

  return labels[eventType] ||
    String(eventType || 'Activity')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatChangeValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'None';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function formatFileSize(bytes) {
  const numericBytes = Number(bytes);

  if (!Number.isFinite(numericBytes) || numericBytes < 0) {
    return 'Unknown size';
  }

  if (numericBytes < 1024) {
    return `${numericBytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = numericBytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function EvidencePanel({
  evidenceItems,
  loading,
  error,
  uploading,
  onRefresh,
  onUpload,
  onDownload,
  onLoadPreview,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [evidenceType, setEvidenceType] = useState('document');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [busyEvidenceId, setBusyEvidenceId] = useState(null);

  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const getEvidenceIcon = (type) => {
    const normalizedType = String(type || '').toLowerCase();

    if (normalizedType === 'photo') {
      return ImageIcon;
    }

    if (normalizedType === 'video') {
      return Video;
    }

    if (normalizedType === 'audio') {
      return Music;
    }

    return FileText;
  };

  const canPreview = (item) => {
    const contentType = String(item?.content_type || '').toLowerCase();

    return (
      contentType.startsWith('image/') ||
      contentType.startsWith('video/') ||
      contentType.startsWith('audio/') ||
      contentType === 'application/pdf'
    );
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewItem(null);
    setPreviewUrl('');
    setPreviewLoading(false);
    setPreviewError('');
  };

  const handlePreview = async (item) => {
    setActionError('');
    setPreviewItem(item);
    setPreviewLoading(true);
    setPreviewError('');

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl('');
    }

    try {
      const blob = await onLoadPreview(item);
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    } catch (requestError) {
      setPreviewError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to preview this evidence file.'
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (item) => {
    setActionError('');
    setBusyEvidenceId(item.id);

    try {
      await onDownload(item);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to download this evidence file.'
      );
    } finally {
      setBusyEvidenceId(null);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setFormError('');
    setActionError('');

    if (!selectedFile) {
      setFormError('Select an evidence file before uploading.');
      return;
    }

    const maximumFileSize = 100 * 1024 * 1024;

    if (selectedFile.size > maximumFileSize) {
      setFormError('The selected file exceeds the 100 MB upload limit.');
      return;
    }

    const formData = new FormData();
    formData.append('evidence_type', evidenceType);
    formData.append('description', description.trim());
    formData.append('file', selectedFile);

    try {
      await onUpload(formData);
      setSelectedFile(null);
      setEvidenceType('document');
      setDescription('');
      setInputKey((currentKey) => currentKey + 1);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to upload the evidence file.'
      );
    }
  };

  return (
    <>
      <section className="bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-tactical-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-tactical-accent" />
            <div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">
                Case Evidence Vault
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Persistent files with SHA-256 integrity records
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
            aria-label="Refresh case evidence"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <form
            onSubmit={handleUpload}
            className="bg-tactical-panel/35 border border-tactical-border/70 rounded-xl p-4 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-blue-400" />
              <p className="text-xs font-bold text-white uppercase tracking-wider">
                Upload New Evidence
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-200 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="evidence-type"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Evidence Classification
                </label>

                <select
                  id="evidence-type"
                  disabled={uploading}
                  value={evidenceType}
                  onChange={(event) => setEvidenceType(event.target.value)}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                >
                  <option value="document">Document</option>
                  <option value="photo">Photo</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="evidence-file"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Select File
                </label>

                <input
                  key={inputKey}
                  id="evidence-file"
                  type="file"
                  required
                  disabled={uploading}
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] || null)
                  }
                  className="block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600/15 file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue-300 hover:file:bg-blue-600/25 disabled:opacity-60"
                />

                {selectedFile && (
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {selectedFile.name} · {formatFileSize(selectedFile.size)}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="evidence-description"
                className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
              >
                Evidence Description
              </label>

              <textarea
                id="evidence-description"
                rows={2}
                disabled={uploading}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the file and its relevance to the investigation..."
                className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent resize-none disabled:opacity-60"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[10px] text-gray-500">
                Maximum file size: 100 MB. Files are stored on the persistent
                GuardFlow evidence volume.
              </p>

              <button
                type="submit"
                disabled={uploading || !selectedFile}
                className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Securing evidence...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Upload Evidence</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {actionError && (
            <div className="p-3 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-lg">
              {actionError}
            </div>
          )}

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin text-tactical-accent" />
              <p className="text-xs">Loading evidence records...</p>
            </div>
          ) : error ? (
            <div className="p-3 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-lg">
              {error}
            </div>
          ) : evidenceItems.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <HardDrive className="w-7 h-7 mx-auto mb-2 text-gray-600" />
              <p className="text-xs">
                No evidence files have been attached to this case.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {evidenceItems.map((item) => {
                const EvidenceIcon = getEvidenceIcon(item.evidence_type);
                const isBusy = busyEvidenceId === item.id;

                return (
                  <article
                    key={item.id}
                    className="bg-tactical-panel/35 border border-tactical-border/70 rounded-xl p-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-300">
                          <EvidenceIcon className="w-5 h-5" />
                        </div>

                        <div className="min-w-0">
                          <p
                            className="text-sm font-semibold text-white break-all"
                            title={item.original_filename}
                          >
                            {item.original_filename}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-gray-500">
                            <span className="uppercase font-bold text-tactical-accent">
                              {item.evidence_type}
                            </span>
                            <span>{formatFileSize(item.file_size)}</span>
                            <span>{formatDateTime(item.created_at)}</span>
                            <span>
                              Operator: {item.uploaded_by_operator_id || 'System'}
                            </span>
                          </div>

                          {item.description && (
                            <p className="text-xs text-gray-400 leading-5 mt-2">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canPreview(item) && (
                          <button
                            type="button"
                            onClick={() => handlePreview(item)}
                            className="px-3 py-2 rounded-lg border border-tactical-border text-gray-300 hover:text-white hover:border-blue-500/40 text-xs font-semibold flex items-center gap-2 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Preview</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          disabled={isBusy}
                          className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span>Download</span>
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-tactical-border/60 flex items-start gap-2">
                      <Hash className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-wider font-bold text-gray-600">
                          SHA-256 Integrity Hash
                        </p>
                        <p className="text-[10px] font-mono text-gray-500 mt-1 break-all">
                          {item.sha256_hash}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {previewItem && (
        <div className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[92vh] bg-tactical-panel border border-tactical-border rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-4 border-b border-tactical-border flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-bold text-tactical-accent">
                  Evidence Preview
                </p>
                <p className="text-sm font-semibold text-white mt-1 truncate">
                  {previewItem.original_filename}
                </p>
              </div>

              <button
                type="button"
                onClick={closePreview}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors"
                aria-label="Close evidence preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 bg-black/40">
              {previewLoading ? (
                <div className="min-h-[420px] flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-7 h-7 animate-spin text-tactical-accent" />
                  <p className="text-sm">Loading protected evidence...</p>
                </div>
              ) : previewError ? (
                <div className="min-h-[420px] flex items-center justify-center">
                  <div className="max-w-md p-4 bg-red-950/30 border border-red-800/40 text-red-200 text-sm rounded-xl text-center">
                    {previewError}
                  </div>
                </div>
              ) : previewUrl ? (
                <>
                  {String(previewItem.content_type).startsWith('image/') && (
                    <img
                      src={previewUrl}
                      alt={previewItem.original_filename}
                      className="max-w-full max-h-[72vh] mx-auto object-contain rounded-lg"
                    />
                  )}

                  {String(previewItem.content_type).startsWith('video/') && (
                    <video
                      src={previewUrl}
                      controls
                      className="w-full max-h-[72vh] rounded-lg bg-black"
                    />
                  )}

                  {String(previewItem.content_type).startsWith('audio/') && (
                    <div className="min-h-[420px] flex items-center justify-center">
                      <audio src={previewUrl} controls className="w-full max-w-xl" />
                    </div>
                  )}

                  {previewItem.content_type === 'application/pdf' && (
                    <iframe
                      src={previewUrl}
                      title={previewItem.original_filename}
                      className="w-full h-[72vh] rounded-lg bg-white"
                    />
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CaseDetailModal({
  caseFile,
  loading,
  error,
  canEdit,
  saving,
  activities,
  activitiesLoading,
  activitiesError,
  evidenceItems,
  evidenceLoading,
  evidenceError,
  evidenceUploading,
  operators,
  operatorsLoading,
  operatorsError,
  onClose,
  onRetry,
  onRetryActivities,
  onRetryEvidence,
  onUploadEvidence,
  onDownloadEvidence,
  onLoadEvidencePreview,
  onSave,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('open');
  const [editOperatorId, setEditOperatorId] = useState('');
  const [editError, setEditError] = useState('');

  const assignedOperator = useMemo(
    () =>
      operators.find(
        (operator) =>
          operator.id === caseFile?.assigned_operator_id
      ) || null,
    [caseFile?.assigned_operator_id, operators]
  );

  const selectableOperators = useMemo(() => {
    const visibleOperators = operators.filter(
      (operator) =>
        operator.is_active ||
        operator.id === editOperatorId
    );

    if (
      editOperatorId &&
      !visibleOperators.some(
        (operator) => operator.id === editOperatorId
      )
    ) {
      return [
        ...visibleOperators,
        {
          id: editOperatorId,
          username: editOperatorId,
          role: 'unknown',
          is_active: false,
        },
      ];
    }

    return visibleOperators;
  }, [editOperatorId, operators]);

  useEffect(() => {
    if (!caseFile) {
      return;
    }

    setEditTitle(caseFile.title || '');
    setEditDescription(caseFile.description || '');
    setEditStatus(caseFile.status || 'open');
    setEditOperatorId(caseFile.assigned_operator_id || '');
    setEditError('');
    setIsEditing(false);
  }, [caseFile]);

  const cancelEditing = () => {
    setEditTitle(caseFile?.title || '');
    setEditDescription(caseFile?.description || '');
    setEditStatus(caseFile?.status || 'open');
    setEditOperatorId(caseFile?.assigned_operator_id || '');
    setEditError('');
    setIsEditing(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setEditError('');

    const cleanTitle = editTitle.trim();

    if (!cleanTitle) {
      setEditError('Case title cannot be empty.');
      return;
    }

    try {
      await onSave({
        title: cleanTitle,
        description: editDescription.trim() || null,
        status: editStatus,
        assigned_operator_id: editOperatorId.trim() || null,
      });

      setIsEditing(false);
    } catch (requestError) {
      setEditError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to update the case file.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[92vh] bg-tactical-panel border border-tactical-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-tactical-border bg-tactical-panel/70 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-tactical-accent font-bold">
              Investigative Case File
            </p>

            <h2 className="text-xl font-bold text-white mt-1">
              {caseFile?.title || 'Loading case record...'}
            </h2>

            {caseFile?.case_number && (
              <p className="text-xs text-gray-400 mt-1">
                {caseFile.case_number}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
            aria-label="Close case details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
              <Loader2 className="w-7 h-7 animate-spin text-tactical-accent" />
              <p className="text-sm">Loading full case record...</p>
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <div className="max-w-md mx-auto p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-sm rounded-xl">
                {error}
              </div>

              <button
                type="button"
                onClick={onRetry}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : caseFile && isEditing ? (
            <form onSubmit={handleSave} className="space-y-5">
              {editError && (
                <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-200 text-xs rounded-lg">
                  {editError}
                </div>
              )}

              <div>
                <label
                  htmlFor="edit-case-title"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Case Title
                </label>

                <input
                  id="edit-case-title"
                  type="text"
                  required
                  disabled={saving}
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-case-description"
                  className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                >
                  Operational Description
                </label>

                <textarea
                  id="edit-case-description"
                  rows={5}
                  disabled={saving}
                  value={editDescription}
                  onChange={(event) =>
                    setEditDescription(event.target.value)
                  }
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent resize-none disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="edit-case-status"
                    className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                  >
                    Current Status
                  </label>

                  <select
                    id="edit-case-status"
                    disabled={saving}
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                    className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                  >
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="active">Active</option>
                    <option value="investigating">Investigating</option>
                    <option value="suspended">Suspended</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="edit-operator-id"
                    className="block text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2"
                  >
                    Assigned Operator
                  </label>

                  <select
                    id="edit-operator-id"
                    disabled={saving || operatorsLoading}
                    value={editOperatorId}
                    onChange={(event) =>
                      setEditOperatorId(event.target.value)
                    }
                    className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2.5 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                  >
                    <option value="">Unassigned</option>
                    {selectableOperators.map((operator) => (
                      <option
                        key={operator.id}
                        value={operator.id}
                      >
                        {operator.username} — {operator.role}
                        {!operator.is_active ? ' (inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {operatorsLoading && (
                <p className="text-[11px] text-gray-500">
                  Loading operator registry...
                </p>
              )}

              {operatorsError && (
                <p className="text-[11px] text-red-300">
                  Operator list warning: {operatorsError}
                </p>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg border border-tactical-border text-gray-300 hover:text-white hover:bg-tactical-border/30 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Case Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : caseFile ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-3 py-1.5 rounded-md tracking-wider">
                    {caseFile.case_number}
                  </span>

                  <span className="text-[11px] font-semibold text-green-400 bg-green-950/40 border border-green-900/40 px-2.5 py-1 rounded-full capitalize">
                    {caseFile.status || 'open'}
                  </span>
                </div>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-300 hover:bg-blue-600 hover:text-white text-xs font-bold flex items-center gap-2 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Case</span>
                  </button>
                )}
              </div>

              <section>
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                  Operational Description
                </p>

                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-sm text-gray-300 leading-6 whitespace-pre-wrap">
                    {caseFile.description ||
                      'No operational description has been recorded for this case.'}
                  </p>
                </div>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                    Assigned Operator
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <UserCheck className="w-4 h-4 text-tactical-accent" />
                    <p className="text-sm font-semibold text-white break-all">
                      {assignedOperator
                        ? `${assignedOperator.username} (${assignedOperator.role})`
                        : caseFile.assigned_operator_id || 'Unassigned'}
                    </p>
                  </div>
                </div>

                <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                    Date Created
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm font-semibold text-white">
                      {formatDateTime(caseFile.created_at)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-tactical-bg border border-tactical-border rounded-xl p-4">
                <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                  Internal Record ID
                </p>

                <p className="text-xs font-mono text-gray-300 mt-2 break-all">
                  {caseFile.id}
                </p>
              </div>

              <EvidencePanel
                evidenceItems={evidenceItems}
                loading={evidenceLoading}
                error={evidenceError}
                uploading={evidenceUploading}
                onRefresh={onRetryEvidence}
                onUpload={onUploadEvidence}
                onDownload={onDownloadEvidence}
                onLoadPreview={onLoadEvidencePreview}
              />

              <section className="bg-tactical-bg border border-tactical-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-tactical-border flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-tactical-accent" />
                    <div>
                      <p className="text-xs font-bold text-white uppercase tracking-wider">
                        Case Activity Timeline
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Recorded changes and operator actions
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onRetryActivities}
                    disabled={activitiesLoading}
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-tactical-border/40 transition-colors disabled:opacity-50"
                    aria-label="Refresh case activity timeline"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${
                        activitiesLoading ? 'animate-spin' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="p-4">
                  {activitiesLoading ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin text-tactical-accent" />
                      <p className="text-xs">Loading activity history...</p>
                    </div>
                  ) : activitiesError ? (
                    <div className="p-3 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-lg">
                      {activitiesError}
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Activity className="w-7 h-7 mx-auto mb-2 text-gray-600" />
                      <p className="text-xs">
                        No activity has been recorded for this case yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-0">
                      {activities.map((activityItem, index) => {
                        const changes = Object.entries(
                          activityItem.changes || {}
                        );

                        return (
                          <div
                            key={activityItem.id}
                            className="relative pl-8 pb-6 last:pb-0"
                          >
                            {index < activities.length - 1 && (
                              <span className="absolute left-[9px] top-5 bottom-0 w-px bg-tactical-border" />
                            )}

                            <span className="absolute left-0 top-1 w-[19px] h-[19px] rounded-full bg-blue-950 border border-blue-500/40 flex items-center justify-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-tactical-accent" />
                            </span>

                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                              <div>
                                <p className="text-xs font-bold text-white">
                                  {formatEventType(
                                    activityItem.event_type
                                  )}
                                </p>
                                <p className="text-xs text-gray-400 mt-1 leading-5">
                                  {activityItem.summary}
                                </p>
                              </div>

                              <p className="text-[10px] text-gray-500 whitespace-nowrap">
                                {formatDateTime(
                                  activityItem.created_at
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gray-500">
                              <UserCheck className="w-3 h-3" />
                              <span>
                                Operator: {
                                  activityItem.operator_id || 'System'
                                }
                              </span>
                            </div>

                            {changes.length > 0 && (
                              <div className="mt-3 grid grid-cols-1 gap-2">
                                {changes.map(([field, values]) => {
                                  const isTransition =
                                    values &&
                                    typeof values === 'object' &&
                                    !Array.isArray(values) &&
                                    (
                                      Object.prototype.hasOwnProperty.call(
                                        values,
                                        'from'
                                      ) ||
                                      Object.prototype.hasOwnProperty.call(
                                        values,
                                        'to'
                                      )
                                    );

                                  return (
                                    <div
                                      key={field}
                                      className="bg-tactical-panel/40 border border-tactical-border/70 rounded-lg p-2.5"
                                    >
                                      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                                        {field.replace(/_/g, ' ')}
                                      </p>

                                      {isTransition ? (
                                        <p className="text-[11px] text-gray-400 mt-1 break-words">
                                          <span className="text-red-300/80">
                                            {formatChangeValue(values.from)}
                                          </span>
                                          <span className="mx-2 text-gray-600">
                                            →
                                          </span>
                                          <span className="text-green-300">
                                            {formatChangeValue(values.to)}
                                          </span>
                                        </p>
                                      ) : (
                                        <p className="text-[11px] text-gray-300 mt-1 break-words">
                                          {formatChangeValue(values)}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CaseDashboard({
  cases,
  loading,
  error,
  onOpenCase,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCases = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return cases;
    }

    return cases.filter((caseFile) =>
      [
        caseFile.case_number,
        caseFile.title,
        caseFile.description,
        caseFile.status,
        caseFile.assigned_operator_id,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [cases, searchTerm]);

  const metrics = useMemo(() => {
    const resolvedStatuses = new Set([
      'resolved',
      'closed',
      'completed',
      'archived',
    ]);

    const activeStatuses = new Set([
      'active',
      'in_progress',
      'investigating',
      'assigned',
    ]);

    const resolved = cases.filter((caseFile) =>
      resolvedStatuses.has(
        String(caseFile.status || '').toLowerCase()
      )
    ).length;

    const active = cases.filter((caseFile) =>
      activeStatuses.has(
        String(caseFile.status || '').toLowerCase()
      )
    ).length;

    return {
      total: cases.length,
      open: Math.max(cases.length - resolved, 0),
      active,
      resolved,
    };
  }, [cases]);

  const metricCards = [
    {
      label: 'Total Files',
      value: metrics.total,
      icon: Briefcase,
      valueClass: 'text-white',
      iconClass: 'text-tactical-accent',
      iconBackground: 'bg-blue-600/10 border-blue-500/10',
    },
    {
      label: 'Open Cases',
      value: metrics.open,
      icon: AlertTriangle,
      valueClass: 'text-yellow-400',
      iconClass: 'text-yellow-400',
      iconBackground:
        'bg-yellow-600/10 border-yellow-500/10',
    },
    {
      label: 'Active',
      value: metrics.active,
      icon: Activity,
      valueClass: 'text-blue-400',
      iconClass: 'text-blue-400',
      iconBackground: 'bg-blue-600/10 border-blue-500/10',
    },
    {
      label: 'Resolved',
      value: metrics.resolved,
      icon: CheckCircle,
      valueClass: 'text-green-400',
      iconClass: 'text-green-400',
      iconBackground:
        'bg-green-600/10 border-green-500/10',
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;

          return (
            <div
              key={metric.label}
              className="bg-tactical-panel border border-tactical-border rounded-xl p-5 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {metric.label}
                </p>

                <h3
                  className={`text-2xl font-bold mt-1 ${metric.valueClass}`}
                >
                  {metric.value}
                </h3>
              </div>

              <div
                className={`p-3 border rounded-xl ${metric.iconBackground} ${metric.iconClass}`}
              >
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-tactical-panel border border-tactical-border rounded-xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-tactical-border bg-tactical-panel/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-white tracking-wide uppercase">
            Case Registries Log
          </h3>

          <div className="relative w-full md:w-72">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
              <Search className="w-3.5 h-3.5" />
            </span>

            <input
              type="text"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Filter cases..."
              className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent"
            />
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-tactical-accent" />
              <span className="text-xs font-medium">
                Synchronising case records...
              </span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/20 border border-red-800/30 text-red-300 text-xs rounded-xl text-center">
              Sync error: {error}
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="py-14 text-center text-gray-500">
              <FolderOpen className="w-9 h-9 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-medium">
                No matching case files found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              {filteredCases.map((caseFile) => {
                const createdAt = caseFile.created_at
                  ? new Date(caseFile.created_at)
                  : null;

                const displayDate =
                  createdAt &&
                  !Number.isNaN(createdAt.getTime())
                    ? createdAt.toLocaleDateString()
                    : 'Not recorded';

                return (
                  <button
                    type="button"
                    key={caseFile.id}
                    onClick={() => onOpenCase(caseFile.id)}
                    className="w-full text-left bg-tactical-bg border border-tactical-border rounded-xl p-5 hover:border-tactical-accent/70 hover:bg-blue-950/10 transition-all flex flex-col justify-between space-y-4 relative overflow-hidden group cursor-pointer"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-tactical-accent bg-blue-950/50 border border-blue-900/40 px-2.5 py-1 rounded-md tracking-wider">
                          {caseFile.case_number ||
                            'UNNUMBERED'}
                        </span>

                        <span className="text-[10px] font-semibold text-green-400 bg-green-950/40 border border-green-900/40 px-2 py-0.5 rounded-full capitalize">
                          {caseFile.status || 'open'}
                        </span>
                      </div>

                      <h4 className="text-md font-bold text-white pt-1 group-hover:text-tactical-accent transition-colors">
                        {caseFile.title || 'Untitled case file'}
                      </h4>

                      <p className="text-xs text-gray-400 leading-relaxed">
                        {caseFile.description ||
                          'No operational overview has been recorded.'}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-tactical-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-gray-500 font-medium">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate max-w-[200px]">
                          Operator:{' '}
                          {caseFile.assigned_operator_id ||
                            'Unassigned'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span>{displayDate}</span>
                        </div>

                        <span className="text-tactical-accent font-bold">
                          Open file →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MainConsole() {
  const { token, user, logout } = useAuth();
  const userRole = user?.role || 'field_agent';
  const hasManagementAccess = [
    'master',
    'admin',
  ].includes(userRole);

  const [currentView, setCurrentView] = useState('cases');
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedCase, setSelectedCase] = useState(null);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseDetailLoading, setCaseDetailLoading] =
    useState(false);
  const [caseDetailError, setCaseDetailError] =
    useState('');
  const [caseUpdateLoading, setCaseUpdateLoading] =
    useState(false);
  const [caseActivities, setCaseActivities] = useState([]);
  const [caseActivitiesLoading, setCaseActivitiesLoading] =
    useState(false);
  const [caseActivitiesError, setCaseActivitiesError] =
    useState('');
  const [caseEvidence, setCaseEvidence] = useState([]);
  const [caseEvidenceLoading, setCaseEvidenceLoading] =
    useState(false);
  const [caseEvidenceError, setCaseEvidenceError] =
    useState('');
  const [caseEvidenceUploading, setCaseEvidenceUploading] =
    useState(false);
  const [operators, setOperators] = useState([]);
  const [operatorsLoading, setOperatorsLoading] =
    useState(false);
  const [operatorsError, setOperatorsError] =
    useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newCaseOperatorId, setNewCaseOperatorId] =
    useState(user?.id || '');
  const [submitLoading, setSubmitLoading] =
    useState(false);
  const [formError, setFormError] = useState('');

  const authenticatedRequest = useCallback(
    async (path, options = {}) => {
      const isFormDataBody =
        typeof FormData !== 'undefined' &&
        options.body instanceof FormData;

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body && !isFormDataBody
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(options.headers || {}),
        },
      });

      const data = await readResponse(response);

      if (response.status === 401) {
        logout();
        throw new Error(
          'Your session expired. Please sign in again.'
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            `GuardFlow request failed with ${response.status}.`
        );
      }

      return data;
    },
    [logout, token]
  );

  const fetchCases = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await authenticatedRequest(
        '/api/v1/cases/'
      );

      setCases(normaliseList(data));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to retrieve case files.'
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedRequest]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  const fetchOperators = useCallback(async () => {
    if (!hasManagementAccess) {
      setOperators([]);
      setOperatorsError('');
      return;
    }

    setOperatorsLoading(true);
    setOperatorsError('');

    try {
      const data = await authenticatedRequest(
        '/api/v1/operators/'
      );

      setOperators(normaliseList(data));
    } catch (requestError) {
      setOperators([]);
      setOperatorsError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load the operator registry.'
      );
    } finally {
      setOperatorsLoading(false);
    }
  }, [authenticatedRequest, hasManagementAccess]);

  useEffect(() => {
    if (hasManagementAccess) {
      fetchOperators();
    }
  }, [fetchOperators, hasManagementAccess, currentView]);

  const loadCaseActivities = useCallback(
    async (caseId) => {
      if (!caseId) {
        setCaseActivities([]);
        return;
      }

      setCaseActivitiesLoading(true);
      setCaseActivitiesError('');

      try {
        const data = await authenticatedRequest(
          `/api/v1/cases/${caseId}/activities`
        );

        setCaseActivities(normaliseList(data));
      } catch (requestError) {
        setCaseActivities([]);
        setCaseActivitiesError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the case activity timeline.'
        );
      } finally {
        setCaseActivitiesLoading(false);
      }
    },
    [authenticatedRequest]
  );

  const loadCaseEvidence = useCallback(
    async (caseId) => {
      if (!caseId) {
        setCaseEvidence([]);
        return;
      }

      setCaseEvidenceLoading(true);
      setCaseEvidenceError('');

      try {
        const data = await authenticatedRequest(
          `/api/v1/evidence/cases/${caseId}`
        );

        setCaseEvidence(normaliseList(data));
      } catch (requestError) {
        setCaseEvidence([]);
        setCaseEvidenceError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the case evidence vault.'
        );
      } finally {
        setCaseEvidenceLoading(false);
      }
    },
    [authenticatedRequest]
  );

  const fetchEvidenceBlob = useCallback(
    async (evidenceItem) => {
      const response = await fetch(
        `${API_URL}/api/v1/evidence/${evidenceItem.id}/download`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        logout();
        throw new Error(
          'Your session expired. Please sign in again.'
        );
      }

      if (!response.ok) {
        const data = await readResponse(response);

        throw new Error(
          data?.detail ||
            `Evidence request failed with ${response.status}.`
        );
      }

      return response.blob();
    },
    [logout, token]
  );

  const downloadCaseEvidence = useCallback(
    async (evidenceItem) => {
      const blob = await fetchEvidenceBlob(evidenceItem);
      const objectUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');

      downloadLink.href = objectUrl;
      downloadLink.download =
        evidenceItem.original_filename || 'guardflow-evidence';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    },
    [fetchEvidenceBlob]
  );

  const uploadCaseEvidence = async (formData) => {
    if (!selectedCaseId) {
      throw new Error('No case file is currently selected.');
    }

    setCaseEvidenceUploading(true);

    try {
      const uploadedEvidence = await authenticatedRequest(
        `/api/v1/evidence/cases/${selectedCaseId}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      await Promise.all([
        loadCaseEvidence(selectedCaseId),
        loadCaseActivities(selectedCaseId),
      ]);

      return uploadedEvidence;
    } finally {
      setCaseEvidenceUploading(false);
    }
  };

  const openCaseDetails = useCallback(
    async (caseId) => {
      setSelectedCaseId(caseId);
      setSelectedCase(null);
      setCaseDetailError('');
      setCaseDetailLoading(true);
      setCaseActivities([]);
      setCaseActivitiesError('');
      setCaseEvidence([]);
      setCaseEvidenceError('');

      loadCaseActivities(caseId);
      loadCaseEvidence(caseId);

      try {
        const data = await authenticatedRequest(
          `/api/v1/cases/${caseId}`
        );

        setSelectedCase(data);
      } catch (requestError) {
        setCaseDetailError(
          requestError instanceof Error
            ? requestError.message
            : 'Unable to load the case record.'
        );
      } finally {
        setCaseDetailLoading(false);
      }
    },
    [
      authenticatedRequest,
      loadCaseActivities,
      loadCaseEvidence,
    ]
  );

  const closeCaseDetails = () => {
    setSelectedCase(null);
    setSelectedCaseId(null);
    setCaseDetailError('');
    setCaseDetailLoading(false);
    setCaseUpdateLoading(false);
    setCaseActivities([]);
    setCaseActivitiesError('');
    setCaseActivitiesLoading(false);
    setCaseEvidence([]);
    setCaseEvidenceError('');
    setCaseEvidenceLoading(false);
    setCaseEvidenceUploading(false);
  };

  const updateCaseDetails = async (updates) => {
    if (!selectedCaseId) {
      throw new Error('No case file is currently selected.');
    }

    setCaseUpdateLoading(true);

    try {
      const updatedCase = await authenticatedRequest(
        `/api/v1/cases/${selectedCaseId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );

      setSelectedCase(updatedCase);
      setCases((currentCases) =>
        currentCases.map((caseFile) =>
          caseFile.id === updatedCase.id
            ? updatedCase
            : caseFile
        )
      );

      await loadCaseActivities(selectedCaseId);

      return updatedCase;
    } finally {
      setCaseUpdateLoading(false);
    }
  };

  const handleCreateCase = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitLoading(true);

    try {
      await authenticatedRequest('/api/v1/cases/', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          assigned_operator_id:
            newCaseOperatorId || null,
        }),
      });

      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setNewCaseOperatorId(user?.id || '');
      await fetchCases();
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to create the case file.'
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  const viewTitle =
    currentView === 'cases'
      ? 'Operational Registers'
      : currentView === 'tracking'
        ? 'Live Telematics Stream'
        : currentView === 'vision'
          ? 'VisionFlow AI Surveillance'
          : 'Operator Administration';

  return (
    <div className="min-h-screen bg-tactical-bg flex flex-col lg:flex-row text-gray-100 font-sans relative">
      <aside className="w-full lg:w-64 bg-tactical-panel border-b lg:border-b-0 lg:border-r border-tactical-border flex lg:flex-col justify-between p-4 lg:p-5 gap-4">
        <div className="space-y-4 lg:space-y-6 flex-1">
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="bg-blue-600/10 p-2 rounded-lg border border-blue-500/20">
              <Shield className="w-6 h-6 text-tactical-accent" />
            </div>

            <div>
              <h2 className="text-md font-bold tracking-tight text-white">
                GuardFlow
              </h2>

              <span className="text-xs text-gray-400 font-medium">
                Operational Intelligence
              </span>
            </div>
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1">
            <button
              type="button"
              onClick={() => setCurrentView('cases')}
              className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                currentView === 'cases'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              <span>Case Files</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentView('tracking')}
              className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                currentView === 'tracking'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                  : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>Telematics</span>
            </button>

            {hasManagementAccess && (
              <button
                type="button"
                onClick={() => setCurrentView('vision')}
                className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                  currentView === 'vision'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>VisionFlow</span>
              </button>
            )}

            {hasManagementAccess && (
              <button
                type="button"
                onClick={() => setCurrentView('operators')}
                className={`w-full flex items-center justify-center lg:justify-start gap-2 lg:gap-3 px-3 py-2.5 rounded-lg text-xs lg:text-sm font-medium transition-colors ${
                  currentView === 'operators'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-tactical-border/30 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Operators</span>
              </button>
            )}
          </nav>
        </div>

        <div className="pt-0 lg:pt-4 lg:border-t border-tactical-border">
          <div className="hidden lg:flex items-center justify-between gap-2 px-2 mb-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-gray-500">
                Authority Level
              </p>
              <p
                className={`text-xs font-bold uppercase mt-1 ${
                  userRole === 'master'
                    ? 'text-yellow-400'
                    : userRole === 'admin'
                      ? 'text-blue-400'
                      : 'text-gray-300'
                }`}
              >
                {userRole === 'master'
                  ? 'Master Developer'
                  : userRole}
              </p>
            </div>

            {userRole === 'master' && (
              <Shield className="w-4 h-4 text-yellow-400" />
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex items-center justify-center gap-2 bg-red-950/20 border border-red-900/30 hover:bg-red-900/20 text-red-400 text-xs font-medium px-3 lg:px-0 lg:w-full py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="min-h-16 border-b border-tactical-border bg-tactical-panel/40 backdrop-blur-sm px-4 md:px-8 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-white">
              {viewTitle}
            </h1>

            <div className="flex items-center gap-1.5 bg-green-950/40 border border-green-800/30 text-green-400 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span>API Connected</span>
            </div>
          </div>

          {currentView === 'cases' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={fetchCases}
                className="p-2 bg-tactical-panel border border-tactical-border rounded-lg text-gray-400 hover:text-white transition-colors"
                aria-label="Refresh case files"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {hasManagementAccess && (
                <button
                  type="button"
                  onClick={() => {
                    setNewCaseOperatorId(user?.id || '');
                    setIsModalOpen(true);
                    fetchOperators();
                  }}
                  className="bg-tactical-accent hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Case File</span>
                </button>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {currentView === 'cases' ? (
            <CaseDashboard
              cases={cases}
              loading={loading}
              error={error}
              onOpenCase={openCaseDetails}
            />
          ) : currentView === 'tracking' ? (
            <Tracking />
          ) : currentView === 'vision' ? (
            <VisionFlow />
          ) : (
            <Operators />
          )}
        </div>
      </main>

      {selectedCaseId && (
        <CaseDetailModal
          caseFile={selectedCase}
          loading={caseDetailLoading}
          error={caseDetailError}
          canEdit={hasManagementAccess}
          saving={caseUpdateLoading}
          activities={caseActivities}
          activitiesLoading={caseActivitiesLoading}
          activitiesError={caseActivitiesError}
          evidenceItems={caseEvidence}
          evidenceLoading={caseEvidenceLoading}
          evidenceError={caseEvidenceError}
          evidenceUploading={caseEvidenceUploading}
          operators={operators}
          operatorsLoading={operatorsLoading}
          operatorsError={operatorsError}
          onClose={closeCaseDetails}
          onRetry={() => openCaseDetails(selectedCaseId)}
          onRetryActivities={() =>
            loadCaseActivities(selectedCaseId)
          }
          onRetryEvidence={() =>
            loadCaseEvidence(selectedCaseId)
          }
          onUploadEvidence={uploadCaseEvidence}
          onDownloadEvidence={downloadCaseEvidence}
          onLoadEvidencePreview={fetchEvidenceBlob}
          onSave={updateCaseDetails}
        />
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-tactical-panel border border-tactical-border rounded-xl p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
              aria-label="Close case form"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-md font-bold text-white uppercase tracking-wide mb-4">
              Initialise Investigative Case File
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 text-red-200 text-xs rounded-lg">
                {formError}
              </div>
            )}

            <form
              onSubmit={handleCreateCase}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="case-title"
                  className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5"
                >
                  Investigation Title
                </label>

                <input
                  id="case-title"
                  type="text"
                  required
                  disabled={submitLoading}
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  placeholder="e.g. Operation Gold Strike"
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="case-description"
                  className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5"
                >
                  Operational Overview
                </label>

                <textarea
                  id="case-description"
                  required
                  rows={4}
                  disabled={submitLoading}
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="Describe the investigation..."
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-tactical-accent resize-none disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="new-case-operator"
                  className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5"
                >
                  Assigned Operator
                </label>

                <select
                  id="new-case-operator"
                  disabled={submitLoading || operatorsLoading}
                  value={newCaseOperatorId}
                  onChange={(event) =>
                    setNewCaseOperatorId(event.target.value)
                  }
                  className="w-full bg-tactical-bg border border-tactical-border rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-tactical-accent disabled:opacity-60"
                >
                  <option value="">Unassigned</option>
                  {operators
                    .filter((operator) => operator.is_active)
                    .map((operator) => (
                      <option
                        key={operator.id}
                        value={operator.id}
                      >
                        {operator.username} — {operator.role}
                      </option>
                    ))}
                </select>

                {operatorsError && (
                  <p className="text-[10px] text-red-300 mt-1.5">
                    Operator list warning: {operatorsError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full bg-tactical-accent hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-2 shadow-lg"
              >
                {submitLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating case file...</span>
                  </>
                ) : (
                  <span>Open Investigative Track</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { token } = useAuth();

  return token ? <MainConsole /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
