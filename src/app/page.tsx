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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
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
  }, [selectedId, fetchConversations, supabase]);

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

  function exportToCSV() {
    if (conversations.length === 0) return;
    
    const headers = ["Phone", "Name", "Employment", "Income", "CIBIL", "Loan Amount", "Loan Type", "City", "Timeline", "Qualified At"];
    const rows = conversations.map(c => [
      c.phone,
      c.name || "",
      formatValue(c.employment_type),
      formatValue(c.income_range),
      formatValue(c.cibil_range),
      formatValue(c.loan_amount),
      formatValue(c.loan_type),
      c.city || "",
      c.timeline || "",
      c.qualified_at ? new Date(c.qualified_at).toLocaleString() : ""
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

  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans">
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
                onClick={() => setSelectedId(convo.id)}
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
                      <span className="text-sm font-medium text-white/90 truncate">
                        {convo.name || convo.phone}
                      </span>
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

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
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
                            <p className="text-[10px] text-white/25 mt-1.5 px-1">
                              {!isUser && <span className="text-emerald-500/60 mr-1">AI ·</span>}
                              {formatTime(msg.created_at)}
                            </p>
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
                <div className="px-5 py-4 border-b border-white/[0.06]">
                  <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">Lead Details</h3>
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
                            {selected.city || "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/30 uppercase font-medium mb-1.5">Timeline</p>
                          <p className="text-sm text-white/90 font-medium bg-white/5 rounded-lg px-3 py-2 border border-white/[0.03]">
                            {selected.timeline || "N/A"}
                          </p>
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
          </>
        )}
      </div>
    </div>
  );
}
