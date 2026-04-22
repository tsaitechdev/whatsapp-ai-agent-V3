# Finjoat AI Agent - Project Memory

## Project Purpose
An automated WhatsApp-based lead qualification system for Finjoat (Personal Loan DSA). The system uses WhatsApp Flows to collect data, stores it in Supabase, and uses Google Gemini AI to handle follow-up concierge services.

## Architecture Highlights
- **Framework**: Next.js (App Router)
- **Database**: Supabase
- **AI**: Google Generative AI (Gemini 3/3.1/2.5)
- **Messaging**: WhatsApp Business Cloud API

## Key Features Fixed & Implemented
1.  **AI History Logic**: Fixed a critical bug where the agent only fetched the first 20 messages. It now fetches the **latest 20 messages**, ensuring it follows the current conversation.
2.  **Robust AI Fallback**: Implemented a 3x3x2 retry loop across three different Gemini models to handle `503 Service Unavailable` errors during high demand.
3.  **PDF Delivery**: Automated the delivery of the `finjoat_cibil_guide.pdf` immediately after form submission.
4.  **Operator Dashboard**: Added a "Lead Details" sidebar and a "CSV Export" feature to [`src/app/page.tsx`](src/app/page.tsx).
5.  **Technical Mapping**: Implemented a `KEY_MAP` to translate technical Flow codes (e.g., `10_20`, `sep`) into professional text for both AI and users.
6.  **Human Mode**: Disabled automatic switching to human mode; it is now a manual trigger for the operator to ensure AI stays active as long as needed.
7.  **Webhook Gating**: Implemented high-speed atomic locking using the `messages` table's unique constraint to block concurrent Meta retries.
8.  **AI Error Handling**: Fixed the role-sequence bug ("First content should be with role user") by ensuring chat history always starts with a user message.
9.  **Lead Management CRM**: Added `status`, `priority`, and `internal_notes` to conversations with an interactive CRM panel in the dashboard.
10. **WhatsApp Status Tracking**: Implemented real-time tracking and UI display for message delivery status (Sent, Delivered, Read).
11. **Lead Scoring (Hot Leads)**: Added automatic lead scoring logic that flags "Hot Leads" based on high income and good CIBIL scores.
12. **Advanced CRM Fields**: Added `assigned_to` and `follow_up_at` fields to allow team collaboration and scheduling.
13. **Real-time Notifications**: Implemented browser push notifications and sound alerts for incoming user messages.
14. **Global Error Logging**: Created a persistent `error_logs` system to track AI and Webhook issues in the database.
15. **Abandoned Flow Recovery**: Built a Cron-ready API route [`src/app/api/cron/abandoned-flow/route.ts`](src/app/api/cron/abandoned-flow/route.ts) to automatically follow up with users who drop off.

## Current Roadmap & Future Ideas
1.  **Multi-Advisor Dashboard**: Add a filter to see only leads assigned to the logged-in user.
2.  **AI Knowledge Base Expansion**: Integrate a PDF parser to allow the AI to answer questions directly from bank-specific policy documents.
3.  **Analytics Dashboard**: Visual charts for Lead conversion rates, average response times, and income distribution.

## Database Schema (`conversations` table)
- `phone` (Unique Key)
- `employment_type`, `income_range`, `cibil_range`, `loan_type`, `loan_amount`, `city`, `timeline`
- `qualified_at` (Qualification timestamp)
- `mode` (`agent` or `human`)
- `internal_notes` (Planned)
- `status` (Planned)

## Known Issues & Future Ideas
- **Vercel Timeout**: Background processing was reverted because standard Serverless functions kill non-awaited tasks. Stay aware of the 10s Meta retry window.
- **Idea**: Implement real-time notifications for new leads.
- **Idea**: Add "Abandoned Flow" follow-ups.

## Developer Instructions
- **System Prompt**: Keep it concise (1-2 sentences).
- **Models**: Priority list is `gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview` -> `gemini-2.5-flash`.
