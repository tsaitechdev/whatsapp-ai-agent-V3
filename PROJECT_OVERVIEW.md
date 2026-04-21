# Finjoat AI Agent - Comprehensive Project Overview

## 1. What is this Project?
The **Finjoat AI Agent** is a next-generation lead generation and customer engagement platform built for WhatsApp. It is designed specifically for **Finjoat**, a Personal Loan DSA (Direct Selling Agent) in India, to automate the process of qualifying loan applicants, answering their immediate questions, and delivering them as "hot leads" to human advisors.

Instead of a simple "chat bot," this is a **Full-Stack Sales Assistant** that combines structured data collection (WhatsApp Flows) with conversational intelligence (Google Gemini AI).

---

## 2. Core Customer Experience (WhatsApp)
The customer journey is automated from start to finish:
- **Instant Greeting**: Users starting a chat are immediately prompted to check their loan eligibility.
- **Interactive Qualification**: Uses **WhatsApp Flows** (a native form-like UI) to collect:
    - Employment Type (Salaried/Self-Employed)
    - Monthly Income
    - CIBIL Score
    - Loan Requirement (Amount & Type)
    - City & Urgency Timeline
- **Immediate Value**: Upon form submission, the bot instantly sends a personalized confirmation and a **CIBIL Guide PDF** to educate the user.
- **AI Concierge**: A highly trained AI agent ("Team Finjoat") stays active to answer follow-up questions about document requirements, interest rates, and processing times in both English and Hindi.

---

## 3. Operator Features (The Dashboard)
For the Finjoat team, the project provides a central control center:
- **Real-time Lead Feed**: See new inquiries as they happen with message snippets and timestamps.
- **Lead Info Sidebar**: A dedicated panel that extracts and displays all form data (Income, CIBIL, etc.) for the selected user, so advisors don't have to read the whole chat.
- **Mode Switching**: Operators can manually toggle between **AI Mode** and **Human Mode** if they want to take over a conversation personally.
- **Excel Export**: A one-click "Export to CSV" button to download all leads for CRM entry or calling lists.
- **CIBIL Status**: High-visibility "Qualified" tags showing exactly when a user finished the form.

---

## 4. Advanced Technical Capabilities
The system is built for industrial-grade stability and intelligence:

### **A. Extreme AI Resilience**
- **18x Retry System**: The agent uses a multi-model fallback loop. If the primary AI is busy, it rotates through **three different Gemini models** (Gemini 3, 3.1, and 2.5) and retries each multiple times.
- **Alternating Context**: Fixed deep-level role errors to ensure the AI always has the correct conversation history.

### **B. Session Intelligence**
- **12-Hour Fresh Start**: If a user returns after 12 hours, the bot automatically clears old test data and lets them start a fresh application.
- **Context Awareness**: The AI is programmed to be concise (1-2 sentences) and avoids repeating system greetings, making it feel like a real professional team.

### **C. High Performance Webhook**
- **Idempotency Guard**: Prevents duplicate messages or double-responses even if WhatsApp retries a request multiple times.
- **Database Synchronization**: All interactions are synced in real-time to Supabase for zero data loss.

---

## 5. Technical Stack
- **Frontend/Backend**: Next.js (App Router)
- **Database**: Supabase (PostgreSQL) with Realtime capabilities.
- **AI Brain**: Google Generative AI SDK (Gemini API).
- **Messaging API**: WhatsApp Business Cloud API (Meta).

---

## 6. Business Value
- **24/7 Availability**: Capture leads at 2 AM without human staff.
- **Reduced Friction**: Mapped technical codes to human-readable text for a professional feel.
- **Data-Driven**: High-quality leads are delivered with all required fields already filled, saving advisors 15-20 minutes per call.
