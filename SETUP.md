# hayula — راهنمای راه‌اندازی روی سیستم جدید

بازسازی کامل محیط کار از روی گیت‌هاب: [github.com/SaeedAqamiri](https://github.com/SaeedAqamiri)

## ریپوها

| ریپو | شاخه اصلی | کاربرد |
|---|---|---|
| `opencode` | `notebook-memory` | فورک opencode با حافظه notebook (نسخه سبک: اسنپ‌شات upstream + کامیت‌های خودم) |
| `notes-plugin` | `master` | پلاگین V1 حافظه دفترچه (.note.yaml) برای opencode |
| `mcp-search` | `main` | سرور MCP جستجوی وب رایگان برای شبکه‌های محدود (بدون API key) |
| `agentic-ai-course` | `master` | درسنامه ساخت ایجنت |
| `legal-agent` | `master` | ایجنت حقوقی (RAG روی مقررات ایران) |
| `opencti` | `ai-ungate` | فورک OpenCTI — حالت AI محلی (نسخه سبک) |
| `opencti-agent` | `main` | ایجنت روی OpenCTI با گیت HITL |
| `qprep` | `master` | سازنده آزمون (خروجی Word راست‌به‌چپ) |

## ۰. پیش‌نیازها

```bash
curl -fsSL https://bun.sh/install | bash          # bun >= 1.3
curl -LsSf https://astral.sh/uv/install.sh | sh   # برای mcp-search
ssh-keygen -t ed25519                             # کلید جدید و اضافه‌کردن آن در github.com/settings/keys
```

## ۱. کلون — مسیرها عینی مهم‌اند

کانفیگ opencode به مسیرهای `/home/saeed/...` اشاره می‌کند؛ یا همین مسیرها را بساز، یا مسیرهای کانفیگ را ویرایش کن.

```bash
mkdir -p ~/hayula
git clone git@github.com:SaeedAqamiri/opencode.git     ~/hayula/opencode
git clone git@github.com:SaeedAqamiri/notes-plugin.git ~/hayula/notes-plugin
git clone git@github.com:SaeedAqamiri/agentic-ai-course.git ~/hayula/agentic-ai-course
git clone git@github.com:SaeedAqamiri/mcp-search.git   ~/mcp-search

cd ~/hayula/opencode
git checkout notebook-memory
git remote add fork git@github.com:SaeedAqamiri/opencode.git   # ریموت پوش‌های بعدی (origin = upstream می‌ماند)
```

## ۲. ساخت opencode

```bash
cd ~/hayula/opencode
bun install     # workspaces + پچ node-pty (postinstall خودکار اجرا می‌شود)
bun dev         # اجرای TUI/CLI — همان opencode روزمره
```

## ۳. mcp-search

```bash
cd ~/mcp-search
uv sync         # .venv را از uv.lock می‌سازد
```

در `~/.config/opencode/opencode.jsonc`:

```jsonc
"mcp": {
  "web-search": {
    "type": "local",
    "command": ["/home/saeed/mcp-search/.venv/bin/python", "/home/saeed/mcp-search/server.py"],
    "timeout": 60000
  }
}
```

> ⚠️ **حتماً پایتون venv مستقیم.** اگر `uv run ...` بگذاری، خروجی setup آن روی stdout،
> جریان JSON-RPC را خراب می‌کند و opencode خطای `MCP error -32000: Connection closed` می‌دهد.

## ۴. notes-plugin

```bash
cd ~/hayula/notes-plugin && bun install
```

فایل `~/.config/opencode/plugins/notes-plugin.ts`:

```ts
import { NotesPlugin } from "/home/saeed/hayula/notes-plugin/src/index.ts"

export default { id: "notes-plugin", server: NotesPlugin }
```

- opencode پوشه `plugins/` را خودکار لود می‌کند.
- `package.json` داخل `~/.config/opencode/` وابستگی `@opencode-ai/plugin` دارد؛ opencode خودش install می‌کند.
- خروجی پلاگین: فایل‌های `.note.yaml` کنار پروژه‌ها (در gitignore هر پروژه هستند).

## ۵. کانفیگ‌های محلی (در هیچ ریپویی نیستند)

دو فایل زیر را از سیستم قدیم کپی کن (حاوی API key هستند — هرگز کامیت نشوند):

```bash
scp سیستم-قدیم:.config/opencode/opencode.jsonc  ~/.config/opencode/
scp سیستم-قدیم:.config/opencode/tui.json        ~/.config/opencode/
```

- `opencode.jsonc` — پروایدرها: `avalai` (api.avalai.ir)، `zai` (apiKey دارد)، `permission.websearch: allow`
- `tui.json` — پلاگین صوتی `@renjfk/opencode-voice` با مدل whisper

قالب `opencode.jsonc` (کلیدها را خودت پر کن):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "permission": { "websearch": "allow" },
  "mcp": { /* بخش ۳ */ },
  "provider": {
    "avalai": {
      "name": "AvalAI",
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "https://api.avalai.ir/v1", "apiKey": "<AVALAI_KEY>" },
      "models": { "deepseek-v4-flash": { "name": "Deepseek-v4-flash" } }
    },
    "zai": {
      "name": "Z.AI Coding Plan",
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "https://api.z.ai/api/coding/paas/v4", "apiKey": "<ZAI_KEY>" },
      "models": { "glm-5.3-flash": { "name": "GLM-5.3-Flash" } }
    }
  }
}
```

## ۶. تأیید نهایی

```bash
cd ~/hayula/opencode && bun dev
```

- در لیست ابزارها `web-search_web_search` دیده شود → mcp-search وصل است
- بعد از چند تسک، فایل `.note.yaml` کنار پروژه ساخته شود → notes-plugin فعال است
- `bun run typecheck` از ریشه opencode برای اطمینان از سلامت بیلد

## ۷. سیستم صوتی (whisper + voice-control)

زنجیره صدا: دکمه‌های opencode → پل `voice-control` (پورت ۸۱۷۹) → `whisper-server` (پورت ۸۱۷۸، مدل large-v3-turbo، زبان fa).

فایل‌های آماده در پوشه `voice/` همین ریپو هستند: اسکریپت `voice-control` و دو یونیت systemd.

### ۷.۱. whisper.cpp — بیلد و مدل

```bash
git clone https://github.com/ggml-org/whisper.cpp ~/opt/whisper.cpp
cd ~/opt/whisper.cpp
cmake -B build && cmake --build build --target whisper-server -j
```

مدل (۵۴۸MB) — یکی از دو راه:

```bash
# راه ۱: انتقال از سیستم قدیم (از ایران مطمئن‌تر)
mkdir -p ~/.local/share/whisper-cpp
scp سیستم-قدیم:.local/share/whisper-cpp/ggml-large-v3-turbo-q5_0.bin  ~/.local/share/whisper-cpp/

# راه ۲: دانلود مستقیم (نیازمند دسترسی به HuggingFace)
cd ~/opt/whisper.cpp && bash models/download-ggml-model.sh large-v3-turbo-q5_0
mkdir -p ~/.local/share/whisper-cpp
cp models/ggml-large-v3-turbo-q5_0.bin ~/.local/share/whisper-cpp/
```

> ⚠️ مسیر مدل در یونیت systemd هاردکد است: `~/.local/share/whisper-cpp/ggml-large-v3-turbo-q5_0.bin`

### ۷.۲. نصب پل و سرویس‌ها

```bash
sudo apt install sox            # voice-control برای ساخت wav پروب به sox نیاز دارد

cd ~/hayula/voice
cp voice-control ~/.local/bin/voice-control && chmod +x ~/.local/bin/voice-control
cp whisper-server.service voice-control.service ~/.config/systemd/user/
systemctl --user daemon-reload
```

اگر یوزر سیستم جدید `saeed` نیست، داخل هر دو فایل `.service` مسیرهای `/home/saeed/...` را اصلاح کن.

### ۷.۳. کلید پروایدر صوتی

پلاگین صوتی از `apiKeyEnv: ZAI_API_KEY` می‌خواند — در `~/.bashrc`:

```bash
export ZAI_API_KEY="<کلید Z.AI — همان opencode.jsonc>"
```

### ۷.۴. فعال‌سازی

```bash
systemctl --user enable --now voice-control   # پل ۸۱۷۹ — همیشه روشن (سبک است)
systemctl --user enable --now whisper-server  # STT ۸۱۷۸ — فقط وقتی صدا می‌خواهی (~۲GB رم)
```

دکمه «whisper toggle» در opencode همین سرویس را خاموش/روشن می‌کند؛ لازم نیست دائمی بماند.

### ۷.۵. تأیید صدا

```bash
curl -s http://127.0.0.1:8179/status            # باید {"state":"..."} بدهد
curl -s -X POST http://127.0.0.1:8179/up        # روشن‌کردن whisper و انتظار تا آماده شود
# حالا در opencode دکمه ضبط را بزن و فارسی حرف بزن
```

## نکات نگهداری

- opencode و opencti روی گیت‌هاب **نسخه سبک**‌اند (اسنپ‌شات upstream + کامیت‌های خودم)؛ تاریخچه کامل upstream عمداً پوش نشده است.
- برای به‌روزرسانی از upstream: `git fetch origin` در ریپوی opencode/opencti محلی، سپس rebase و `git push fork`.
- فایل‌های `.note.yaml` حافظه محلی‌اند و بین سیستم‌ها منتقل نمی‌شوند (طراحی بی‌خیال).
