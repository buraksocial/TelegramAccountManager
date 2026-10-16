# Telegram Account Manager

Telegram account, account-group, and scheduled-scenario management panel.

**Türkçe dokümantasyon:** [README_tr.md](README_tr.md)

> **Security:** Session files, API credentials, and account data must stay private. Runtime data files are excluded by `.gitignore`.

## Features

- Add accounts with StringSession or phone authentication
- Organize accounts into custom groups
- Bulk join and leave operations by account group
- Quickly select saved group/channel targets
- Time-based message and comment scenarios
- Scenario collections that can be enabled, disabled, and copied to another account group
- Telegram chats, folders, messages, and media in the web panel
- Scrollable and collapsible account/scenario lists
- Turkish and English interface with a remembered language preference

## Installation

```bash
npm install
cp .env.example .env
# Fill in your credentials before starting (Node.js with --env-file support).
node --env-file=.env bot.js
```

The panel runs at `http://localhost:3000` by default. Copy `.env.example` to `.env` and fill in the values. Never commit the real `.env` file.

## Configuration and data safety

The following files are intentionally local and ignored by Git:

`.env`, `hesaplar.json`, `senaryolar.json`, `senaryo-gruplari.json`, `dialoglar.json`, `apiler.txt`, `proxyler.txt`, and `*.session`.

Keep these files on the server and create backups before updating the application. The repository contains only application code, documentation, and demo screenshots.

## Updating an existing server

Stop the running application and back up its runtime files outside the checkout first. Review local source changes before using reset: it discards modifications to tracked files. An update for a dedicated checkout is:

```bash
cd /var/www/telegram-manager
git fetch origin
git status --short
git reset --hard origin/master
npm ci --omit=dev
node --env-file=.env bot.js
```

These runtime paths are currently untracked by the repository, so reset normally preserves them. This is not a backup guarantee: reset can overwrite untracked paths that obstruct tracked files. Do not use `git clean` on a data-bearing checkout. Keep account order unchanged when transferring `hesaplar.json`: scenarios refer to account indices.

For production, stop the process before updating and start it again with PM2, systemd, or the Plesk Node.js application manager. Keep `.env` and the ignored data files outside the repository if possible, then symlink them into the application directory.

## Screenshots

The screenshots use masked demo data and do not contain real accounts or sessions:

### Account and group management

![Türkçe hesap ve grup yönetimi](docs/screenshots/accounts-turkish.png)

![English account management](docs/screenshots/accounts-english.png)

### Scenario collections

![English scenario collections](docs/screenshots/scenarios-english.png)

## License

See the license field in `package.json`; no standalone license file is currently included.
