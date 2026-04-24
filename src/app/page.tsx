"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

const KEY_MAP: Record<string, string> = {
  "10_20": "10-20 Lakhs",
  "5_10": "5-10 Lakhs",
  "3_5": "3-5 Lakhs",
  "below5": "Below 5 Lakhs",
  "above20": "Above 20 Lakhs",
  "bt": "Balance Transfer",
  "pl": "Personal Loan",
  "hl": "Home Loan",
  "lap": "Loan Against Property",
  "topup": "Top-up Loan",
  "salaried": "Salaried",
  "self_employed": "Self Employed",
  "above100": "100k+",
  "50_100": "50k-100k",
  "25_50": "25k-50k",
  "below25": "Below 25k",
  "750_plus": "750+",
  "700_750": "700-750",
  "650_700": "650-700",
  "below650": "Below 650",
};

function formatValue(val: any): string {
  if (val === undefined || val === null) return "N/A";
  const str = String(val).toLowerCase();
  return KEY_MAP[str] || String(val);
}

export default function Dashboard() {
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"chat" | "table">("chat");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortField, setSortField] = useState<string>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  useEffect(() => {
    audioRef.current = new Audio("/notification.mp3");
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations?t=" + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    setConversations(data);
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    setMessages(data);
  }, []);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/logs");
    const data = await res.json();
    setLogs(data);
  }, []);

  const clearLogs = async () => {
    await fetch("/api/logs", { method: "DELETE" });
    setLogs([]);
  };

  useEffect(() => {
    if (showLogs) fetchLogs();
  }, [showLogs, fetchLogs]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("realtime-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          if (newMsg.role === "user") {
            audioRef.current?.play().catch(() => {});
            if ("Notification" in window && Notification.permission === "granted") {
              const lead = conversations.find(c => c.id === newMsg.conversation_id);
              new Notification(`New message from ${lead?.name || lead?.phone || "Lead"}`, {
                body: newMsg.content,
                icon: "/favicon.ico"
              });
            }
          }
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [selectedId, fetchConversations, supabase, conversations]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    fetchConversations();
  }

  async function updateCRMField(field: string, value: any) {
    const id = selectedId || (typeof value === 'object' ? value.id : null);
    if (!id) return;
    
    let finalValue = value;
    if (field === "is_hot_lead") finalValue = value === "true";

    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: finalValue }),
    });
    fetchConversations();
  }

  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getInitials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone.slice(-2);
  }

  function MessageStatus({ status }: { status?: string }) {
    if (!status || status === "sent") {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/40">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    }
    if (status === "delivered") {
      return (
        <div className="flex -space-x-1.5 text-white/40">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    }
    if (status === "read") {
      return (
        <div className="flex -space-x-1.5 text-blue-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    }
    return null;
  }

  function exportToCSV() {
    if (conversations.length === 0) return;
    const headers = ["Phone", "Name", "Status", "Priority", "Employment", "Income", "CIBIL", "Loan Amount", "Loan Type", "City", "Timeline", "Qualified At", "Notes"];
    const rows = conversations.map(c => [
      c.phone, c.name || "", c.status || "New", c.priority || "Medium",
      formatValue(c.employment_type), formatValue(c.income_range), formatValue(c.cibil_range),
      formatValue(c.loan_amount), formatValue(c.loan_type), c.city || "", c.timeline || "",
      c.qualified_at ? new Date(c.qualified_at).toLocaleString() : "", c.internal_notes || ""
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `finjoat_leads_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const statuses = ["New", "Interested", "In Progress", "Follow-up Required", "Closed (Won)", "Closed (Lost)"];

  const filteredAndSortedLeads = useMemo(() => {
    let list = [...conversations];
    if (filterStatus !== "All") list = list.filter(c => (c.status || "New") === filterStatus);
    list.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];
      if (sortField.includes("_at")) {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [conversations, filterStatus, sortField, sortOrder]);

  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans text-white">
      {/* Overlay Views */}
      {showPipeline && (
        <div className="fixed inset-0 z-50 bg-[#0f0f0f] flex flex-col">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#141414]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </div>
              <h2 className="text-lg font-bold">Lead Pipeline</h2>
            </div>
            <button onClick={() => setShowPipeline(false)} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg">Close</button>
          </div>
          <div className="flex-1 overflow-x-auto p-6 flex gap-6 bg-[#0a0a0a]">
            {statuses.map(status => {
              const leads = conversations.filter(c => (c.status || "New") === status);
              return (
                <div key={status} className="w-[300px] flex-shrink-0 flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">{status}</h3>
                    <span className="text-[10px] bg-white/5 text-white/40 px-2 py-0.5 rounded-full">{leads.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2">
                    {leads.map(lead => (
                      <div key={lead.id} onClick={() => { setSelectedId(lead.id); setShowPipeline(false); setViewMode("chat"); }} className={`p-4 rounded-xl border border-white/[0.06] cursor-pointer transition-all hover:bg-white/[0.02] ${lead.is_hot_lead ? 'bg-orange-500/5 border-orange-500/20' : 'bg-[#141414]'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold truncate">{lead.name || lead.phone}</span>
                          {lead.is_hot_lead && <span>🔥</span>}
                        </div>
                        <p className="text-[11px] text-white/40">{formatValue(lead.loan_amount)} {formatValue(lead.loan_type)}</p>
                        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[9px] text-white/20">
                          <span className={lead.priority === 'High' || lead.priority === 'Urgent' ? 'text-red-400' : ''}>{lead.priority || "Medium"}</span>
                          <span>{new Date(lead.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showLogs && (
        <div className="fixed inset-0 z-50 bg-[#0f0f0f] flex flex-col">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#141414]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              </div>
              <h2 className="text-lg font-bold">System Debug Logs</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={clearLogs} className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg">Clear All</button>
              <button onClick={() => setShowLogs(false)} className="px-4 py-2 bg-white/10 rounded-lg">Close</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6 bg-[#0a0a0a] font-mono">
            <div className="max-w-5xl mx-auto space-y-2">
              {logs.length === 0 ? <div className="text-center py-20 text-white/20">No logs found</div> : logs.map((log) => (
                <div key={log.id} className={`p-3 rounded-lg border ${log.level === 'error' ? 'bg-red-500/5 border-red-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${log.level === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}>{log.level}</span>
                    <span className="text-[10px] text-white/40">{new Date(log.created_at).toLocaleString()}</span>
                    <span className="text-[10px] text-emerald-500 font-bold uppercase">{log.component}</span>
                  </div>
                  <p className="text-sm">{log.message}</p>
                  {log.metadata && <pre className="text-[10px] text-white/20 bg-black/40 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-[320px] flex flex-col border-r border-white/[0.06] bg-[#141414]">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold">AI Agent</h1>
              <p className="text-xs text-white/40">{conversations.length} leads</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={fetchConversations} className="p-1.5 rounded-md hover:bg-white/10 text-white/40" title="Refresh"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
            <button onClick={() => setViewMode(viewMode === "chat" ? "table" : "chat")} className={`p-1.5 rounded-md ${viewMode === "table" ? "text-emerald-400 bg-emerald-500/10" : "text-white/40"}`} title="Table View"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg></button>
            <button onClick={() => setShowPipeline(true)} className="p-1.5 rounded-md hover:bg-white/10 text-white/40" title="Pipeline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></button>
            <button onClick={() => setShowLogs(true)} className="p-1.5 rounded-md hover:bg-white/10 text-white/40" title="Logs"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></button>
            <button onClick={exportToCSV} className="p-1.5 rounded-md hover:bg-white/10 text-white/40" title="CSV"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? <div className="text-center py-10 text-white/20 text-xs">No leads found</div> : conversations.map((convo) => (
            <button key={convo.id} onClick={() => { setSelectedId(convo.id); setViewMode("chat"); }} className={`w-full text-left px-4 py-3.5 border-b border-white/[0.02] ${selectedId === convo.id ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold">{getInitials(convo.name, convo.phone)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-sm font-medium truncate">{convo.name || convo.phone} {convo.is_hot_lead && "🔥"}</span>
                    <span className="text-[10px] text-white/30">{formatTime(convo.updated_at)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-white/40">
                    <p className="truncate mr-2">{convo.last_message || "No messages"}</p>
                    <span className={`text-[9px] px-1 rounded ${convo.mode === 'agent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{convo.mode === 'agent' ? 'AI' : 'HU'}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
        {viewMode === "table" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] bg-[#141414] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="font-semibold">Lead Database</h2>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-white/5 text-xs border border-white/10 rounded px-2 py-1 outline-none">
                  <option value="All" className="bg-[#141414]">All Statuses</option>
                  {statuses.map(s => <option key={s} value={s} className="bg-[#141414]">{s}</option>)}
                </select>
              </div>
              <span className="text-[10px] text-white/30 font-bold uppercase">{filteredAndSortedLeads.length} Leads</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left min-w-[1200px]">
                <thead className="sticky top-0 bg-[#141414] text-[10px] text-white/40 uppercase font-bold border-b border-white/[0.06]">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => { setSortField("name"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Name/Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Loan Details</th>
                    <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => { setSortField("updated_at"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Last Active</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03] text-sm">
                  {filteredAndSortedLeads.map(lead => (
                    <tr key={lead.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div>{lead.name || lead.phone} {lead.is_hot_lead && "🔥"}</div>
                        {lead.name && <div className="text-[10px] text-white/30">{lead.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <select value={lead.status || "New"} onChange={(e) => updateCRMField("status", { id: lead.id, status: e.target.value })} className="bg-white/5 text-[11px] border border-white/10 rounded px-2 py-0.5 outline-none">
                          {statuses.map(s => <option key={s} value={s} className="bg-[#141414]">{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select value={lead.priority || "Medium"} onChange={(e) => updateCRMField("priority", { id: lead.id, priority: e.target.value })} className={`bg-white/5 text-[11px] border border-white/10 rounded px-2 py-0.5 outline-none ${lead.priority === 'High' ? 'text-red-400' : ''}`}>
                          <option value="Low" className="bg-[#141414]">Low</option><option value="Medium" className="bg-[#141414]">Medium</option><option value="High" className="bg-[#141414]">High</option><option value="Urgent" className="bg-[#141414]">Urgent</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input type="text" defaultValue={lead.assigned_to || ""} onBlur={(e) => updateCRMField("assigned_to", { id: lead.id, assigned_to: e.target.value })} placeholder="Advisor..." className="bg-white/5 text-[11px] border border-white/10 rounded px-2 py-0.5 outline-none w-24"/>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white/80">{formatValue(lead.loan_amount)} {formatValue(lead.loan_type)}</div>
                        <div className="text-[10px] text-white/30">{lead.city || "N/A"}</div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-white/30">{new Date(lead.updated_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedId(lead.id); setViewMode("chat"); }} className="bg-emerald-500/10 text-emerald-400 text-[10px] px-3 py-1 rounded-md font-bold hover:bg-emerald-500 hover:text-white transition-all">Chat</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          !selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/20">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <div className="text-center"><p className="text-sm">Select a lead to start chatting</p><p className="text-xs">Or switch to Table View for management</p></div>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-white/[0.06] bg-[#141414] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold">{getInitials(selected.name, selected.phone)}</div>
                  <div><h2 className="text-sm font-semibold">{selected.name || selected.phone}</h2><p className="text-xs text-white/40">{selected.phone}</p></div>
                </div>
                <button onClick={toggleMode} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selected.mode === 'agent' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${selected.mode === 'agent' ? 'bg-emerald-400' : 'bg-amber-400'}`} /> {selected.mode === 'agent' ? 'AI Agent' : 'Human Mode'}
                </button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {messages.map((msg, i) => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`flex flex-col ${msg.role === 'user' ? 'items-start' : 'items-end'} max-w-[85%]`}>
                          <div className={`px-4 py-2.5 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-white/[0.07] border border-white/[0.06]' : 'bg-emerald-600 text-white'}`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          <div className="text-[10px] text-white/25 mt-1.5 px-1 flex items-center gap-1">
                            {msg.role !== 'user' && <span className="text-emerald-500/60">AI ·</span>}
                            {formatTime(msg.created_at)}
                            {msg.role !== 'user' && <MessageStatus status={msg.status} />}
                          </div>
                          {debugMode && <div className="text-[9px] text-white/10 mt-1 font-mono bg-white/[0.02] p-1 rounded max-w-[200px] break-all">ID: {msg.whatsapp_msg_id}<br/>ST: {msg.status}</div>}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="px-6 py-4 border-t border-white/[0.06] bg-[#141414]">
                    <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/10 focus-within:border-emerald-500/40 transition-all">
                      <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/20"/>
                      <button onClick={handleSend} disabled={sending || !input.trim()} className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center justify-center">
                        {sending ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="w-[280px] border-l border-white/[0.06] flex flex-col bg-[#141414]">
                  <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Lead Details</h3>
                    <button onClick={() => setDebugMode(!debugMode)} className={`p-1 rounded ${debugMode ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/20'}`}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {selected.qualified_at ? (
                      <div className="space-y-5">
                        <div className="space-y-4">
                          {[
                            {l: "Employment", v: formatValue(selected.employment_type)},
                            {l: "Income", v: formatValue(selected.income_range)},
                            {l: "CIBIL", v: formatValue(selected.cibil_range)},
                            {l: "Loan", v: `${formatValue(selected.loan_amount)} (${formatValue(selected.loan_type)})`},
                            {l: "City", v: selected.city || "N/A"},
                            {l: "Timeline", v: formatValue(selected.timeline)}
                          ].map(f => <div key={f.l}><p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">{f.l}</p><p className="text-sm font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">{f.v}</p></div>)}
                        </div>
                        <div className="pt-5 border-t border-white/[0.06] space-y-4">
                          <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">CRM Panel</h4>
                          <div><p className="text-[10px] text-white/30 mb-1.5">Status</p><select value={selected.status || "New"} onChange={(e) => updateCRMField("status", e.target.value)} className="w-full bg-white/5 text-sm rounded-lg px-3 py-2 border border-white/5 outline-none focus:border-emerald-500/40"><option value="New" className="bg-[#141414]">New</option>{statuses.map(s => <option key={s} value={s} className="bg-[#141414]">{s}</option>)}</select></div>
                          <div><p className="text-[10px] text-white/30 mb-1.5">Priority</p><select value={selected.priority || "Medium"} onChange={(e) => updateCRMField("priority", e.target.value)} className="w-full bg-white/5 text-sm rounded-lg px-3 py-2 border border-white/5 outline-none focus:border-emerald-500/40"><option value="Low" className="bg-[#141414]">Low</option><option value="Medium" className="bg-[#141414]">Medium</option><option value="High" className="bg-[#141414]">High</option><option value="Urgent" className="bg-[#141414]">Urgent</option></select></div>
                          <div><p className="text-[10px] text-white/30 mb-1.5">Assigned To</p><input type="text" defaultValue={selected.assigned_to || ""} onBlur={(e) => updateCRMField("assigned_to", e.target.value)} placeholder="Advisor..." className="w-full bg-white/5 text-sm rounded-lg px-3 py-2 border border-white/5 outline-none focus:border-emerald-500/40"/></div>
                          <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/5"><span className="text-xs text-white/60">Hot Lead 🔥</span><button onClick={() => updateCRMField("is_hot_lead", (!selected.is_hot_lead).toString())} className={`w-8 h-4 rounded-full relative transition-all ${selected.is_hot_lead ? 'bg-orange-500' : 'bg-white/10'}`}><div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${selected.is_hot_lead ? 'right-0.5' : 'left-0.5'}`} /></button></div>
                          <div><p className="text-[10px] text-white/30 mb-1.5">Notes</p><textarea defaultValue={selected.internal_notes || ""} onBlur={(e) => updateCRMField("internal_notes", e.target.value)} placeholder="Notes..." className="w-full bg-white/5 text-sm rounded-lg px-3 py-2 border border-white/5 outline-none focus:border-emerald-500/40 h-20 resize-none"/></div>
                        </div>
                        <div className="pt-4 border-t border-white/[0.06]"><p className="text-[10px] text-emerald-500/60 font-bold uppercase mb-1">Status: Qualified</p><p className="text-[10px] text-white/20 uppercase">At {new Date(selected.qualified_at).toLocaleString()}</p></div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center text-white/20"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg><p className="text-xs">Lead form not submitted</p></div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}
