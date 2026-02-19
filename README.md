# Bright Waves LMS (Cloudflare Pages + KV)

This project is a multi-page LMS designed for **Cloudflare Pages** and embedding via **iframe**.

## Features
- Cloudflare KV persistence for users/progress/ack/viewed (survives refresh)
- Token auth stored in `sessionStorage` (iframe-friendly; avoids third‑party cookie issues)
- Multi-role user assignment
- Introduction module locks all other modules until completed
- Anti-cheat quiz:
  - Separate quiz page
  - Randomised answer order
  - 100% pass required
- Route guards + deep-link protection:
  - Can't open quiz unless module was opened + acknowledged

## Deploy steps
1) Create a KV namespace named `BW_LMS`
2) In Cloudflare Pages: bind KV to Functions
   - Binding name: `BW_LMS`
3) Deploy this folder as a Cloudflare Pages project (Framework preset: None)

Default accounts (seeded on first run):
- admin / admin123
- instructor / teach123
- cs / cs123

Security note:
- Passwords are stored in KV as **salted PBKDF2 (SHA-256) hashes** (no plain-text passwords in KV).
- Sessions are token-based (stored in KV with 24h TTL).
