# 🏥 PMHNP Job Board

> **The #1 Job Board for Psychiatric Mental Health Nurse Practitioners**  
> Built with modern web technologies to connect PMHNPs with their dream roles.

![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-cyan?style=flat-square&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-teal?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue?style=flat-square&logo=postgresql)
![Stripe](https://img.shields.io/badge/Stripe-Payments-635bff?style=flat-square&logo=stripe)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel&style=flat-square)

---

## 📖 Overview

**PMHNP Job Board** is a specialized platform designed to aggregate and list job opportunities for Psychiatric Mental Health Nurse Practitioners. It features a robust multi-source job aggregation engine, a seamless employer dashboard for job postings, and a user-friendly job search experience for candidates.

### 🌟 Key Features

| Feature | Description |
|---------|-------------|
| **For Job Seekers** | Advanced filtering, One-click apply, Job alerts (Daily/Weekly), Saved jobs, Resume upload. |
| **For Employers** | Free/Paid job postings, Dashboard analytics (Views, Clicks), Applicant tracking, Stripe invoices. |
| **Job Aggregation** | Automatically fetches jobs from Adzuna, Jooble, Greenhouse, Lever, and other major sources. |
| **Smart System** | Auto-deduplication, Salary normalization (Hourly ↔ Annual), Location parsing & cleanup. |
| **Monetization** | Integrated Stripe checkout for premium job posts, renewals, and featured upgrades. |
| **SEO Ready** | Dynamic sitemap, Structured Data (Schema.org), Meta tags optimization. |

---

## 🛠 Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Database:** [PostgreSQL](https://www.postgresql.org/) (via [Supabase](https://supabase.com/))
- **ORM:** [Prisma](https://www.prisma.io/)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Auth:** [Supabase Auth](https://supabase.com/auth)
- **Payments:** [Stripe](https://stripe.com/)
- **Emails:** [Resend](https://resend.com/)
- **Cron Jobs:** Vercel Cron

---

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites

- Node.js 20+
- PostgreSQL Database (Supabase recommended)
- Stripe Account
- Resend Account

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/pmhnp-job-board.git
   cd pmhnp-job-board
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Copy the example env file and fill in your credentials.
   ```bash
   cp .env.example .env.local
   ```
   > **Note:** You will need keys for Supabase, Stripe, and Resend.

4. **Database Setup:**
   ```bash
   npx prisma generate
   npx prisma db push
   # Optional: Seed the database
   npx prisma db seed
   ```

5. **Run the Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## 🏗 Project Structure

```bash
├── app/                  # Next.js App Router (Pages & API)
│   ├── api/              # API Routes (Jobs, Cron, Webhooks)
│   ├── (auth)/           # Authentication Pages
│   ├── dashboard/        # Employer Dashboard
│   ├── admin/            # Admin Panel
│   └── jobs/             # Job Listing Pages
├── components/           # Reusable UI Components
├── lib/                  # Utilities & Business Logic
│   ├── auth/             # Auth helpers (Permission checks)
│   ├── jobs/             # Aggregation & Processing Logic
│   └── prisma.ts         # DB Client
├── prisma/               # Database Schema & Seeds
├── public/               # Static Assets
└── scripts/              # Maintenance Scripts
```

---

## 🔧 Scripts & Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server. |
| `npm run build` | Build for production. |
| `npm run lint` | Run ESLint. |
| `npx prisma studio` | Open database GUI. |
| `npm run audit:jobs` | Run job health audit script. |

---

## 📜 Database Schema (High Level)

- **User:** Stores profile data, linked to Supabase Auth.
- **Job:** Core job listing data (Title, Salary, Location, etc.).
- **Company:** Verified employer profiles.
- **JobAlert:** stored search criteria for email notifications.
- **EmployerJob:** Payment & Dashboard metadata for posts.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License.
