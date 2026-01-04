# Attendance Management Dashboard

BarberFlow is a modern staff management and attendance tracking system built to manage daily check-ins, check-outs, QR-based attendance validation, and incident reporting for barbershops and similar businesses.

The system is designed with security, scalability, and real-world workflows in mind and integrates tightly with Supabase for authentication, database management, and edge functions.

## Features

- 🔐 Secure authentication using Supabase Auth

- 📅 Daily QR code generation for attendance tracking

- 📲 QR-based check-in and check-out flow

- ⚠️ Incident logging and tracking

- 👥 Worker management with owner-based access control (RLS)

- 📊 Attendance history and real-time status visibility

- ✉️ Optional QR delivery via email (SMTP / Resend supported)

- 📷 Dedicated scanner workflow (prevents self check-in)

## System Overview

The project consists of two connected applications:

- 1️⃣ Owner Dashboard

Used by business owners or managers

Manages workers, QR codes, attendance, and incidents

Generates and emails daily QR codes

Has full access to all business data

- 2️⃣ Scanner Website

Used on-site by staff operating a scanner

Requires login via Supabase Auth

Scans QR codes and validates attendance

Displays scan feedback only (no sensitive data)

Both applications use the same Supabase project.

## QR Code Attendance Flow

Owner generates daily QR codes

Workers receive a token-only QR code via email

Worker presents the QR code at the workplace

Scanner operator logs in and scans the QR

Edge Function validates:

- QR token validity

- Correct type (check-in / check-out)

- Time window

- Scanner authentication

- Attendance or incident is recorded securely

⚠️ QR codes do not contain clickable links, preventing self check-in.

## Security Design

- JWT-based authentication for all scanner actions

- Row Level Security (RLS) enforced on all tables

- owner_id used to isolate data per business

- No service role keys exposed to frontend

- Token-only QR codes (not URLs)

 Authenticated scanners only can validate attendance

## Tech Stack

- Frontend: React + TypeScript

- Build Tool: Vite

- UI: Tailwind CSS + shadcn/ui

- Backend: Supabase

-- PostgreSQL

-- Supabase Auth

-- Supabase Edge Functions

## Project Structure
src/
  components/        # Reusable UI components
  pages/             # Application pages
  hooks/             # Custom React hooks
  integrations/      # Supabase client & external services

supabase/
  functions/         # Edge functions (QR, attendance, email)
  migrations/        # Database migrations

# Getting Started (Local Development)
## Prerequisites

- Node.js (v18+ recommended)

- npm or pnpm

- A Supabase project (URL + anon key)

## Setup

Clone the repository:

git clone <your-repository-url>
cd <project-name>


Install dependencies:

npm install


Create a .env file:

VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key


Run the development server:

npm run dev

# Supabase Configuration

Ensure the following are set up in Supabase:

- Authentication enabled (email/password)

- Row Level Security (RLS) enabled

- Required tables:

-- workers

-- attendance

-- incidents

-- daily_qr_codes

-- scanners

-- qr_email_delivery

-Edge Functions deployed:

-- generate-daily-qr

-- send-qr-email
 
-- validate-qr-scan

-- scan-attendance

# Email Delivery

The system supports QR delivery via email using:

Resend

Or SMTP providers (e.g. Gmail App Password)

Email delivery status is tracked in the database for reliability and auditing.

## Deployment

The frontend can be deployed on platforms like Vercel

Supabase remains the single backend

The project can be fully managed via GitHub

Lovable can be disconnected without breaking functionality

## Intended Use Cases

Barbershops

Salons

Gyms

Small to medium businesses

Any environment requiring physical attendance validation

## License

This project is proprietary and intended for controlled internal use.
Customization and extension are encouraged for business needs.
