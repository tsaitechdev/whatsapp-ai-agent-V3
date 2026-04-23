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
  const [viewMode, setViewMode] = useState<"chat" | "table">("chat");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortField, setSortField] = useState<string>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio("/notification.mp3");
    
    // Request notification permission
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
      .channel("realtime-messages")
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

          // Trigger sound and notification
          if (newMsg.role === "user") {
            audioRef.current?.play().catch(() => {});
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("New message from " + (conversations.find(c => c.id === newMsg.conversation_id)?.name || "Lead"), {
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
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function updateCRMField(field: string, value: any) {
    if (!selected) return;
    
    // Convert string "true"/"false" to boolean if field is is_hot_lead
    let finalValue = value;
    if (field === "is_hot_lead") finalValue = value === "true";

    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: finalValue }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, [field]: finalValue } : c))
    );
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
      c.phone,
      c.name || "",
      c.status || "New",
      c.priority || "Medium",
      formatValue(c.employment_type),
      formatValue(c.income_range),
      formatValue(c.cibil_range),
      formatValue(c.loan_amount),
      formatValue(c.loan_type),
      c.city || "",
      c.timeline || "",
      c.qualified_at ? new Date(c.qualified_at).toLocaleString() : "",
      c.internal_notes || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `finjoat_leads_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const statuses = ["New", "Interested", "In Progress", "Follow-up Required", "Closed (Won)", "Closed (Lost)"];

  const filteredAndSortedLeads = useMemo(() => {
    let list = [...conversations];
    
    // Filtering
    if (filterStatus !== "All") {
      list = list.filter(c => (c.status || "New") === filterStatus);
    }

    // Sorting
    list.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a];
      let valB: any = b[sortField as keyof typeof b];

      if (sortField === "updated_at" || sortField === "created_at" || sortField === "qualified_at") {
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
    <div className="flex h-screen bg-[#0f0f0f] font-sans">
      {/* Pipeline Overlay */}
      {showPipeline && (
        <div className="fixed inset-0 z-50 bg-[#0f0f0f] flex flex-col">
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-white">Lead Pipeline</h2>
            </div>
            <button 
              onClick={() => setShowPipeline(false)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-all"
            >
              Close
            </button>
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
                      <div 
                        key={lead.id} 
                        onClick={() => {
                          setSelectedId(lead.id);
                          setShowPipeline(false);
                          setViewMode("chat");
                        }}
                        className={`p-4 rounded-xl border border-white/[0.06] cursor-pointer transition-all hover:border-emerald-500/40 hover:bg-white/[0.02] ${lead.is_hot_lead ? 'bg-orange-500/5 border-orange-500/20' : 'bg-[#141414]'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-white/90 truncate">{lead.name || lead.phone}</span>
                          {lead.is_hot_lead && <span className="text-orange-500">🔥</span>}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] text-white/40 truncate">{formatValue(lead.loan_amount)} {formatValue(lead.loan_type)}</p>
                          <p className="text-[10px] text-white/25">{lead.city || "No City"}</p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${lead.priority === 'High' || lead.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-white/30'}`}>
                            {lead.priority || "Medium"}
                          </span>
                          <span className="text-[9px] text-white/20">{new Date(lead.updated_at).toLocaleDateString()}</span>
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

      {/* Sidebar */}
      <div className="w-[320px] flex flex-col border-r border-white/[0.06]" style={{ background: "#141414" }}>
        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-tight">AI Agent</h1>
              <p className="text-xs text-white/40 leading-tight mt-0.5">{conversations.length} leads</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={fetchConversations}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/90 transition-all"
              title="Refresh Data"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
            <button 
              onClick={() => setViewMode(viewMode === "chat" ? "table" : "chat")}
              className={`p-1.5 rounded-md transition-all ${viewMode === "table" ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-white/10 text-white/40 hover:text-white/90"}`}
              title="Table View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18" />
              </svg>
            </button>
            <button 
              onClick={() => setShowPipeline(true)}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/90 transition-all"
              title="Pipeline View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </button>
            <button 
              onClick={exportToCSV}
              className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white/90 transition-all"
              title="Export to CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-xs text-white/30">No conversations yet</p>
            </div>
          )}
          {conversations.map((convo) => {
            const isSelected = selectedId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => { setSelectedId(convo.id); setViewMode("chat"); }}
                className={`w-full text-left px-4 py-3.5 transition-all duration-150 relative group ${
                  isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-emerald-500 rounded-r" />
                )}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
                    {getInitials(convo.name, convo.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-white/90 truncate">
                          {convo.name || convo.phone}
                        </span>
                        {convo.is_hot_lead && (
                          <span title="Hot Lead" className="text-orange-500 flex-shrink-0 animate-pulse">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 21.1c-.1 0-.3 0-.4-.1-2.3-1.1-4.7-3.4-5.3-6.1-.3-1.4.1-3 1.3-4.1.2-.2.5-.2.7 0 .2.2.2.5 0 .7-1 .9-1.2 2.2-.9 3.4.5 2.2 2.6 4.1 4.5 5 1.9-.9 4-2.8 4.5-5 .3-1.2.1-2.5-.9-3.4-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 1.2 1.1 1.6 2.7 1.3 4.1-.6 2.7-3 5-5.3 6.1-.1.1-.3.1-.4.1z" />
                              <path d="M12 17.5c-2.4 0-4.3-1.9-4.3-4.3 0-1.2.5-2.3 1.3-3.1.2-.2.5-.2.7 0 .2.2.2.5 0 .7-.6.6-1 1.5-1 2.4 0 1.8 1.5 3.3 3.3 3.3s3.3-1.5 3.3-3.3c0-.9-.4-1.8-1-2.4-.2-.2-.2-.5 0-.7.2-.2.5-.2.7 0 .8.8 1.3 1.9 1.3 3.1 0 2.4-1.9 4.3-4.3 4.3z" />
                              <path d="M12 12c-.3 0-.5-.2-.5-.5v-9c0-.3.2-.5.5-.5s.5.2.5.5v9c0 .3-.2.5-.5.5z" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/30 flex-shrink-0">
                        {formatTime(convo.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {convo.last_message ? (
                        <p className="text-xs text-white/40 truncate">{convo.last_message}</p>
                      ) : (
                        <span />
                      )}
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 uppercase tracking-wide ${
                          convo.mode === "agent"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {convo.mode === "agent" ? "AI" : "You"}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Chat or Table */}
      <div className="flex-1 flex flex-col min-w-0">
        {viewMode === "table" ? (
          <div className="flex-1 flex flex-col bg-[#0a0a0a] overflow-hidden">
            {/* Table Header / Filters */}
            <div className="px-6 py-4 border-b border-white/[0.06] bg-[#141414] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-white font-semibold">Lead Database</h2>
                <div className="h-4 w-[1px] bg-white/10" />
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-white/5 text-xs text-white/60 border border-white/10 rounded px-2 py-1 outline-none focus:border-emerald-500/40"
                >
                  <option value="All">All Statuses</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                {filteredAndSortedLeads.length} Leads Found
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="sticky top-0 bg-[#141414] z-10">
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60" onClick={() => { setSortField("name"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Name / Phone</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60" onClick={() => { setSortField("status"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Status</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60" onClick={() => { setSortField("priority"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Priority</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider">Employment</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider">Income</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider">Loan</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider">City</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/60" onClick={() => { setSortField("updated_at"); setSortOrder(sortOrder === "asc" ? "desc" : "asc"); }}>Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filteredAndSortedLeads.map((lead) => (
                    <tr 
                      key={lead.id} 
                      onClick={() => {
                        setSelectedId(lead.id);
                        setViewMode("chat");
                      }}
                      className="hover:bg-white/[0.02] cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white/90 font-medium truncate max-w-[150px]">{lead.name || lead.phone}</span>
                          {lead.is_hot_lead && <span className="text-[10px]">🔥</span>}
                        </div>
                        {lead.name && <p className="text-[10px] text-white/30">{lead.phone}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/5">
                          {lead.status || "New"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold ${lead.priority === 'High' || lead.priority === 'Urgent' ? 'text-red-400' : lead.priority === 'Low' ? 'text-white/30' : 'text-white/60'}`}>
                          {lead.priority || "Medium"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">{formatValue(lead.employment_type)}</td>
                      <td className="px-4 py-3 text-xs text-white/50">{formatValue(lead.income_range)}</td>
                      <td className="px-4 py-3 text-xs text-white/50">
                        <span className="text-white/80">{formatValue(lead.loan_amount)}</span>
                        <p className="text-[10px] text-white/30">{formatValue(lead.loan_type)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/50">{lead.city || "N/A"}</td>
                      <td className="px-4 py-3 text-[11px] text-white/30">{new Date(lead.updated_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white/40">Select a conversation</p>
                  <p className="text-xs text-white/20 mt-1">Choose from the list to start chatting</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat Header */}
                <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between" style={{ background: "#141414" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white text-xs font-semibold">
                      {getInitials(selected.name, selected.phone)}
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-white leading-tight">
                        {selected.name || selected.phone}
                      </h2>
                      <p className="text-xs text-white/40 leading-tight mt-0.5">{selected.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleMode}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        selected.mode === "agent"
                          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20"
                          : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20"
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selected.mode === "agent" ? "bg-emerald-400" : "bg-amber-400"}`} />
                      {selected.mode === "agent" ? "AI Mode" : "Human Mode"}
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* Messages Area */}
                  <div className="flex-1 flex flex-col min-w-0">
                    <div
                      className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                      style={{
                        backgroundImage: "radial-gradient(circle at 20% 80%, rgba(16,185,129,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.02) 0%, transparent 50%)",
                      }}
                    >
                      {messages.map((msg, i) => {
                        const isUser = msg.role === "user";
                        const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                          >
                            <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[85%]`}>
                              <div
                                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                                  isUser
                                    ? "bg-white/[0.07] text-white/90 rounded-tl-sm border border-white/[0.06]"
                                    : "bg-emerald-600 text-white rounded-tr-sm"
                                }`}
                              >
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                              {showTime && (
                                <div className="flex flex-col items-start gap-1">
                                  <p className="text-[10px] text-white/25 mt-1.5 px-1 flex items-center gap-1">
                                    {!isUser && <span className="text-emerald-500/60 mr-1">AI ·</span>}
                                    {formatTime(msg.created_at)}
                                    {!isUser && <MessageStatus status={msg.status} />}
                                  </p>
                                  {debugMode && (
                                    <p className="text-[9px] text-white/10 font-mono px-1 break-all bg-white/[0.02] rounded p-1">
                                      ID: {msg.whatsapp_msg_id || 'LOCAL'}<br/>
                                      Raw Status: {msg.status || 'sent'}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div className="px-6 py-4 border-t border-white/[0.06]" style={{ background: "#141414" }}>
                      <div className="flex items-center gap-3 bg-white/[0.06] rounded-xl px-4 py-2.5 border border-white/[0.06] focus-within:border-emerald-500/40 transition-colors">
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                          placeholder="Type a message..."
                          className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                        />
                        <button
                          onClick={handleSend}
                          disabled={sending || !input.trim()}
                          className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center flex-shrink-0"
                          aria-label="Send"
                        >
                          {sending ? (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="22" y1="2" x2="11" y2="13" />
                              <polygon points="22 2 15 22 11 13 2 9 22 2" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Lead Details Sidebar */}
                  <div className="w-[280px] border-l border-white/[0.06] flex flex-col" style={{ background: "#141414" }}>
                    <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Lead Details</h3>
                      <button 
                        onClick={() => setDebugMode(!debugMode)}
                        className={`p-1 rounded transition-colors ${debugMode ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/5 text-white/20'}`}
                        title="Toggle Debug Info"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                      {selected.qualified_at ? (
                        <>
                          <div className="space-y-4">
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Employment</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.employment_type)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Income (Monthly)</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.income_range)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">CIBIL Score</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.cibil_range)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Loan Requirement</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.loan_amount)} ({formatValue(selected.loan_type)})
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">City</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.city)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Timeline</p>
                              <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                                {formatValue(selected.timeline)}
                              </p>
                            </div>
                          </div>
                          
                          {/* CRM Panel */}
                          <div className="pt-6 mt-6 border-t border-white/[0.06] space-y-4">
                            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">CRM Management</h3>
                            
                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Lead Status</p>
                              <select 
                                value={selected.status || "New"}
                                onChange={(e) => updateCRMField("status", e.target.value)}
                                className="w-full bg-white/5 text-sm text-white/90 font-medium rounded-lg px-3 py-2 border border-white/[0.03] focus:outline-none focus:border-emerald-500/40 appearance-none cursor-pointer"
                              >
                                <option value="New" className="bg-[#141414] text-white">New</option>
                                <option value="Interested" className="bg-[#141414] text-white">Interested</option>
                                <option value="In Progress" className="bg-[#141414] text-white">In Progress</option>
                                <option value="Follow-up Required" className="bg-[#141414] text-white">Follow-up Required</option>
                                <option value="Closed (Won)" className="bg-[#141414] text-white">Closed (Won)</option>
                                <option value="Closed (Lost)" className="bg-[#141414] text-white">Closed (Lost)</option>
                              </select>
                            </div>

                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Priority</p>
                              <select 
                                value={selected.priority || "Medium"}
                                onChange={(e) => updateCRMField("priority", e.target.value)}
                                className="w-full bg-white/5 text-sm text-white/90 font-medium rounded-lg px-3 py-2 border border-white/[0.03] focus:outline-none focus:border-emerald-500/40 appearance-none cursor-pointer"
                              >
                                <option value="Low" className="bg-[#141414] text-white">Low</option>
                                <option value="Medium" className="bg-[#141414] text-white">Medium</option>
                                <option value="High" className="bg-[#141414] text-white">High</option>
                                <option value="Urgent" className="bg-[#141414] text-white">Urgent</option>
                              </select>
                            </div>

                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Assigned To</p>
                              <input 
                                type="text"
                                defaultValue={selected.assigned_to || ""}
                                onBlur={(e) => updateCRMField("assigned_to", e.target.value)}
                                placeholder="Advisor name..."
                                className="w-full bg-white/5 text-sm text-white/90 font-medium rounded-lg px-3 py-2 border border-white/[0.03] focus:outline-none focus:border-emerald-500/40"
                              />
                            </div>

                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Follow-up At</p>
                              <input 
                                type="datetime-local"
                                defaultValue={selected.follow_up_at ? new Date(selected.follow_up_at).toISOString().slice(0, 16) : ""}
                                onBlur={(e) => updateCRMField("follow_up_at", e.target.value)}
                                className="w-full bg-white/5 text-sm text-white/90 font-medium rounded-lg px-3 py-2 border border-white/[0.03] focus:outline-none focus:border-emerald-500/40"
                              />
                            </div>

                            <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                              <span className="text-xs text-white/60">Hot Lead</span>
                              <button
                                onClick={() => updateCRMField("is_hot_lead", (!selected.is_hot_lead).toString())}
                                className={`w-10 h-5 rounded-full transition-colors relative ${selected.is_hot_lead ? 'bg-orange-500' : 'bg-white/10'}`}
                              >
                                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${selected.is_hot_lead ? 'right-1' : 'left-1'}`} />
                              </button>
                            </div>

                            <div>
                              <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Internal Notes</p>
                              <textarea 
                                defaultValue={selected.internal_notes || ""}
                                onBlur={(e) => updateCRMField("internal_notes", e.target.value)}
                                placeholder="Add notes about this lead..."
                                className="w-full bg-white/5 text-sm text-white/90 font-medium rounded-lg px-3 py-2 border border-white/[0.03] focus:outline-none focus:border-emerald-500/40 min-h-[80px] resize-none"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-white/[0.06]">
                            <p className="text-[10px] text-emerald-500/60 uppercase font-bold mb-1">Status: Qualified</p>
                            <p className="text-[10px] text-white/20 uppercase font-medium">
                              At {new Date(selected.qualified_at).toLocaleString()}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-4">
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10 9 9 9 8 9" />
                            </svg>
                          </div>
                          <p className="text-xs text-white/30 leading-relaxed">
                            Lead form not yet submitted by this user
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
