'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Send,
  Eye,
  Trash2,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ClientReport {
  id: string;
  agency_id: string;
  client_organization_id: string;
  client_name: string;
  title: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  summary: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface ReportStats {
  total_reports: number;
  draft_reports: number;
  published_reports: number;
  sent_reports: number;
  clients_with_reports: number;
}

export default function AgencyReportsPage() {
  const [reports, setReports] = useState<ClientReport[]>([]);
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newReport, setNewReport] = useState({
    client_organization_id: '',
    title: '',
    report_type: 'monthly',
    period_start: '',
    period_end: '',
    summary: '',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [reportsRes, statsRes] = await Promise.all([
        api.get<ApiResponse<ClientReport[]>>('/client-reports', { params: { agency_id: orgId } }),
        api.get<ApiResponse<ReportStats>>('/client-reports/stats', { params: { agency_id: orgId } }),
      ]);
      setReports(reportsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newReport.client_organization_id || !newReport.title) return;
    try {
      await api.post('/client-reports', {
        body: { agency_id: orgId, ...newReport },
      });
      setShowCreate(false);
      setNewReport({ client_organization_id: '', title: '', report_type: 'monthly', period_start: '', period_end: '', summary: '' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    }
  };

  const handleSend = async (reportId: string) => {
    try {
      await api.post(`/client-reports/${reportId}/send`, { body: { agency_id: orgId } });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send report');
    }
  };

  const handleDelete = async (reportId: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      await api.delete(`/client-reports/${reportId}`, { params: { agency_id: orgId } });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Reports</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Generate and send branded reports to your clients.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
        >
          <Plus className="h-4 w-4" />
          Create Report
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <p className="text-sm text-zinc-400">Total Reports</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.total_reports}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <p className="text-sm text-zinc-400">Drafts</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.draft_reports}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <p className="text-sm text-zinc-400">Sent</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.sent_reports}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <p className="text-sm text-zinc-400">Clients</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.clients_with_reports}</p>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Create Report</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Client Organization ID</label>
              <input
                type="text"
                value={newReport.client_organization_id}
                onChange={(e) => setNewReport({ ...newReport, client_organization_id: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Organization UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Report Title</label>
              <input
                type="text"
                value={newReport.title}
                onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Monthly Marketing Report"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Report Type</label>
              <select
                value={newReport.report_type}
                onChange={(e) => setNewReport({ ...newReport, report_type: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="campaign">Campaign</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Summary</label>
              <input
                type="text"
                value={newReport.summary}
                onChange={(e) => setNewReport({ ...newReport, summary: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Brief summary"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCreate}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
            >
              Create Report
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] py-20">
          <BarChart3 className="h-12 w-12 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No reports yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
          >
            <Plus className="h-4 w-4" />
            Create your first report
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] px-6 py-3 text-xs font-medium text-zinc-400">
            <div className="col-span-4">Report</div>
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {reports.map((report) => (
            <div
              key={report.id}
              className="grid grid-cols-12 items-center gap-4 border-b border-white/[0.04] px-6 py-4 last:border-0"
            >
              <div className="col-span-4">
                <p className="text-sm font-medium text-white">{report.title}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(report.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-white">{report.client_name}</p>
              </div>
              <div className="col-span-2">
                <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-brand-400 capitalize">
                  {report.report_type}
                </span>
              </div>
              <div className="col-span-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    report.status === 'sent'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : report.status === 'published'
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'bg-zinc-500/10 text-zinc-400'
                  }`}
                >
                  {report.status}
                </span>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                {report.status !== 'sent' && (
                  <button
                    onClick={() => handleSend(report.id)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400"
                    title="Send"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(report.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
