# Attendance Managment Dashboard

BarberFlow is a modern staff management and attendance tracking dashboard built to manage daily check-ins, check-outs, QR-based attendance validation, and incident reporting for barbershops and similar businesses.

The system is designed with security, scalability, and real-world workflows in mind and integrates tightly with Supabase for authentication, database, and edge functions.

---

## Features

- 🔐 Secure authentication using Supabase Auth  
- 📅 Daily QR code generation for attendance tracking  
- 📲 QR-based check-in and check-out flow  
- ⚠️ Incident logging and tracking  
- 👥 Worker management with owner-based access control (RLS)  
- 📊 Attendance history and status visibility  
- ✉️ Optional QR delivery via email (SMTP / Resend supported)  

---

## Tech Stack

- **Frontend:** React + TypeScript  
- **Build Tool:** Vite  
- **UI:** Tailwind CSS + shadcn/ui  
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions)  

---

## Project Structure

src/
components/ # Reusable UI components
pages/ # Application pages
integrations/ # Supabase client & external services
supabase/
functions/ # Edge functions (QR, attendance, email)

yaml
Copy code

---

## Getting Started (Local Development)

### Prerequisites

- Node.js (v18+ recommended)
- npm or pnpm
- Supabase project (URL + anon key)

### Setup

```bash
# Clone the repository
git clone <YOUR_GIT_REPO_URL>

# Enter the project directory
cd barberflow-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
Environment Variables
Create a .env file in the project root:

env
Copy code
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
If email delivery is enabled:

env
Copy code
RESEND_API_KEY=your_resend_key
Deployment
This project can be deployed on any modern frontend hosting platform.

Recommended options:

Vercel

Netlify

Cloudflare Pages

After deployment, make sure to configure the same environment variables in your hosting provider.

Security Notes
Row Level Security (RLS) is enforced in Supabase

Owners can only access their own data

Scanner and staff access is strictly limited

QR tokens are validated server-side

Scanner Integration
This dashboard is designed to work with a separate scanner web app that:

Authenticates via Supabase

Scans token-only QR codes

Calls secure edge functions to validate attendance

Both apps must use the same Supabase project.

