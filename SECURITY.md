# Security

Cafe Journal is a static website and PWA (GitHub Pages) with Firebase Auth and Firestore, plus a small Cloudflare Worker for the AI helper. This page covers what protects it and how the three security tools below fit in.

## 1. OWASP ZAP: automatic scan (in use)

[zaproxy/zaproxy](https://github.com/zaproxy/zaproxy) runs as `.github/workflows/security-scan.yml`:

- **When:** every Monday, after every change to `main`, or on demand under **Actions → Security scan → Run workflow**.
- **What:** a passive baseline scan of `https://kalmeshgs.github.io/cafe/` and `/cafe/app/`. It reads the public pages only. It never logs in, never submits forms and never touches the database.
- **Results:** a table on the run's summary page, plus HTML and JSON reports under **Artifacts → zap-reports**. The run fails if ZAP finds anything **High** risk.
- **Rule settings:** `.zap/rules.tsv` mutes informational noise only.

### Findings GitHub Pages cannot fix

GitHub Pages does not let a site set its own HTTP headers. ZAP will therefore always report these:

| ZAP finding | How it is handled instead |
|---|---|
| Content Security Policy header not set | A strict CSP is set in a `<meta>` tag on every page. Only the app's own scripts can run. |
| Missing anti-clickjacking header | `guard.js` loads first and refuses to show the page inside another site's frame. |
| X-Content-Type-Options header missing | Files are served by GitHub with the correct content types. |
| Permissions Policy / Cross-Origin (Spectre) headers | Not settable on Pages. The app uses no camera, mic or location by default. |

To fix these at the header level, put the site behind your own domain on a server or proxy you control (see SafeLine below).

## 2. SafeLine WAF: needs your own server (not applicable yet)

[chaitin/SafeLine](https://github.com/chaitin/SafeLine) is a self-hosted web application firewall: a reverse proxy that runs in Docker on a Linux server you own.

- Traffic must flow **through** that server. GitHub Pages and the Firebase/Google APIs are hosted by GitHub and Google, so SafeLine cannot sit in front of them.
- **If you move to your own domain** (for example `app.yourbrand.in`):
  1. Rent a small Linux VPS (2 CPU / 4 GB RAM is enough).
  2. Install Docker and SafeLine: `bash -c "$(curl -fsSLk https://waf.chaitin.com/release/latest/manager.sh)" -- --en`.
  3. Add your domain in the SafeLine console with GitHub Pages as the upstream.
  4. Point the domain's DNS at the server.
  5. Set the security headers from the table above in SafeLine.
- **Free alternative with no server:** put the custom domain on Cloudflare's free plan. That gives a managed WAF, bot protection and custom headers.

What already protects the data today, with no WAF:

- **Firestore security rules** (`firestore.rules`): each café can only read and write its own data, by role.
- **Firebase App Check** (reCAPTCHA): blocks scripts and bots that are not the real app.
- **Firebase Auth**: password rules, plus an idle lock in the app.
- **AI helper (Cloudflare Worker)**: checks the Firebase login token and the website origin, has a per-user rate limit, caps request size, and sends strict security headers.

## 3. MobSF: for Android/iOS app files (not applicable yet)

[MobSF](https://github.com/MobSF/Mobile-Security-Framework-MobSF) scans compiled mobile apps (`.apk`, `.aab`, `.ipa`).

Cafe Journal is installed as a PWA from the browser, so there is no APK or IPA to scan yet. If you later publish to the Play Store, scan the APK before each release:

```bash
docker run -it --rm -p 8000:8000 opensecurity/mobile-security-framework-mobsf:latest
# open http://localhost:8000, upload the APK, and fix every High finding before publishing
```

A TWA build with Bubblewrap or PWABuilder is one way to make that APK.

## Reporting a problem

Please report security issues privately to the owner instead of opening a public issue.
