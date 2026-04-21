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

## Database Schema (`conversations` table)
- `phone` (Unique Key)
- `employment_type`, `income_range`, `cibil_range`, `loan_type`, `loan_amount`, `city`, `timeline`
- `qualified_at` (Qualification timestamp)
- `mode` (`agent` or `human`)

## Known Issues & Future Ideas
- **Vercel Timeout**: Background processing was reverted because standard Serverless functions kill non-awaited tasks. Stay aware of the 10s Meta retry window.
- **Idea**: Implement real-time notifications for new leads.
- **Idea**: Add "Abandoned Flow" follow-ups.

## Developer Instructions
- **System Prompt**: Keep it concise (1-2 sentences).
- **Models**: Priority list is `gemini-3-flash-preview` -> `gemini-3.1-flash-lite-preview` -> `gemini-2.5-flash`.
