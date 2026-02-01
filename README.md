# Ink & Code

> Write ideas with code, express creativity with technology.

A modern blog system built with Next.js 16, featuring elegant design, smooth interactions, and support for both Markdown files and PostgreSQL database as content storage.

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=flat-square&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-6.0-2d3748?style=flat-square&logo=prisma)

## Preview

- Homepage: Immersive hero section + latest articles showcase
- Blog: Article list, category navigation, tag filtering
- Article Detail: Markdown rendering, code highlighting, table of contents
- Admin Dashboard: Rich text editor, article management, category management
- AI Assistant: Smart Q&A floating widget

## Features

### Core Features
- Responsive design, perfectly adapted for mobile and desktop
- Dark/Light theme auto-switching
- Markdown content rendering (GFM, code highlighting, math formulas)
- Article categories and tags system
- Full-text search

### Admin Dashboard (`/admin`)
- Visual rich text editor (Tiptap)
- Article CRUD operations
- Category management
- Draft/Publish status toggle

### AI Chat Assistant
- Intelligent Q&A powered by DeepSeek/OpenAI
- Floating widget interaction, non-intrusive reading experience

### Technical Highlights
- Next.js 16 App Router + Server Components
- Incremental Static Regeneration (ISR) for performance
- GitHub Actions CI/CD auto-deployment
- PM2 process management + Nginx reverse proxy

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| UI Components | Radix UI |
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Editor | Tiptap |
| AI | AI SDK (DeepSeek/OpenAI) |
| Deployment | PM2 + Nginx / Vercel |

## Quick Start

### Requirements

- Node.js >= 20
- pnpm >= 9
- PostgreSQL >= 14 (optional, uses Markdown files without database)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ink-and-code.git
cd ink-and-code
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Local Development (Using Markdown Files)

No database configuration needed, just run:

```bash
pnpm start
```

Articles are stored in the `content/posts/` directory. Visit http://localhost:3000

### 4. Using Database (Optional)

#### 4.1 Configure Environment Variables

Create a `.env.local` file:

```env
# Database connection
DATABASE_URL="postgresql://user:password@localhost:5432/ink_and_code"

# AI Assistant (optional)
DEEPSEEK_API_KEY="your-deepseek-api-key"
# Or use OpenAI
OPENAI_API_KEY="your-openai-api-key"
```

#### 4.2 Initialize Database

```bash
# Push schema to database
pnpm db:push

# (Optional) Migrate existing Markdown articles to database
pnpm db:migrate
```

#### 4.3 View Data with Prisma Studio

```bash
pnpm db:studio
```

## Deployment

### Option 1: Self-Hosted Server (Recommended)

The project is configured with GitHub Actions for auto-deployment. Push code to `main` branch to trigger deployment.

#### 1. Server Environment Setup

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Install PM2
npm install -g pm2

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install Nginx (for reverse proxy and HTTPS)
apt install -y nginx certbot python3-certbot-nginx
```

#### 2. Configure GitHub Secrets

Add the following in repository Settings → Secrets and variables → Actions:

| Secret Name | Description |
|-------------|-------------|
| `SERVER_HOST` | Server IP address |
| `SERVER_USER` | SSH username (e.g., root) |
| `SERVER_PORT` | SSH port (default 22) |
| `SERVER_SSH_KEY` | SSH private key |
| `PROJECT_PATH` | Project deployment path (e.g., /ptc/ink-and-code) |
| `DATABASE_URL` | PostgreSQL connection string |

#### 3. Configure Nginx and HTTPS

```bash
# Create Nginx configuration
cat > /etc/nginx/sites-available/your-domain.com << 'EOF'
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/your-domain.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Configure HTTPS (Let's Encrypt free certificate)
certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 4. Push Code to Trigger Deployment

```bash
git add .
git commit -m "deploy: update blog"
git push origin main
```

### Option 2: Vercel Deployment

1. Push code to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Create Postgres database in Storage and connect
4. Configure environment variables (AI keys, etc.)
5. Deployment complete

## Project Structure

```
ink-and-code/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── article/          # Article CRUD
│   │   ├── category/         # Category CRUD
│   │   └── chat/             # AI chat
│   ├── admin/                # Admin dashboard
│   ├── blog/                 # Blog pages
│   ├── about/                # About page
│   └── components/           # Page components
├── components/ui/            # Shared UI components
├── content/posts/            # Markdown articles
├── lib/
│   ├── posts.ts              # Article data layer
│   ├── prisma.ts             # Prisma client
│   └── hooks/                # React Hooks
├── prisma/
│   └── schema.prisma         # Database models
├── .github/workflows/        # CI/CD configuration
│   ├── ci.yml                # Continuous integration
│   └── deploy-server.yml     # Auto deployment
└── ecosystem.config.js       # PM2 configuration
```

## Development Commands

```bash
pnpm start        # Start development server (Turbopack)
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm db:push      # Push database schema
pnpm db:studio    # Open Prisma Studio
pnpm db:migrate   # Migrate Markdown articles to database
```

## API Endpoints

### Articles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/article/list` | Get article list |
| GET | `/api/article/detail?id=xxx` | Get article detail |
| POST | `/api/article/create` | Create article |
| PUT | `/api/article/update` | Update article |
| DELETE | `/api/article/delete?id=xxx` | Delete article |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/category/list` | Get category list |
| POST | `/api/category/create` | Create category |
| PUT | `/api/category/update` | Update category |
| DELETE | `/api/category/delete?id=xxx` | Delete category |

### AI Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | AI conversation (streaming response) |

## Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Submit a Pull Request

## License

[MIT License](LICENSE)

---

**Ink & Code** - Recording programming explorations, sharing technical insights, bridging technology and humanity.
