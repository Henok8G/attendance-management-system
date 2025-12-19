# C-Mac Barbershop Admin Dashboard - Updates

## Changes Made

### 1. Database Migrations
- Added columns to `workers` table: `birthdate`, `description`, `employment_type`, `contract_end_date`, `hire_date`
- Created `worker_notes` table for owner notes/reminders
- Added `phone` and `bio` columns to `admin_profiles`

### 2. Timezone Fix (Critical Date Bug Fix)
- Replaced manual UTC+3 offset with `date-fns-tz` library
- All date operations now use `Africa/Addis_Ababa` timezone
- Fixed off-by-one bug in date picker by using `formatToYYYYMMDD()` instead of `toISOString().split('T')[0]`
- Key functions: `getToday()`, `formatToYYYYMMDD()`, `parseYYYYMMDD()`

### 3. Worker Profile Page (`/workers/:id`)
- Full profile view with photo, name, age, role, description
- Employment info: type (contract/full-time), hire date, contract end date, salary
- Weekly attendance mini-calendar
- Incidents feed
- Notes/reminders section (add, view, delete)
- Actions: Edit, Deactivate, Download QR, Export PDF

### 4. Owner Profile Page (`/profile`)
- Editable display name, phone, bio
- Photo upload
- Password reset via email
- Accessible from header dropdown

### 5. Worker Card Navigation
- Clicking worker card now links to full profile page

## QA Checklist

### Date Filtering Tests
- [ ] Create worker with hire_date = 2025-12-18, query Dec 15 → worker should NOT appear
- [ ] Query Dec 18 → worker should appear
- [ ] Select a date in datepicker → verify exact date is shown (no off-by-one)
- [ ] Test date picker at month/year boundaries

### Worker Profile Tests
- [ ] Click worker card → opens profile page
- [ ] Edit worker info → saves correctly
- [ ] Add note → appears with timestamp
- [ ] Delete note → removed
- [ ] Download QR → file downloads
- [ ] Export PDF → generates report

### Owner Profile Tests
- [ ] Navigate to profile from header dropdown
- [ ] Edit display name → saves
- [ ] Upload photo → displays in header
- [ ] Click reset password → email sent

### Photo Upload Tests
- [ ] Upload worker photo in form
- [ ] Photo appears in worker list, profile, and tables
