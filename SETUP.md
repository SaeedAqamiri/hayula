# hayula — راهنمای راه‌اندازی روی سیستم جدید

بازسازی کامل محیط کار از روی گیت‌هاب: [github.com/SaeedAqamiri](https://github.com/SaeedAqamiri)

## ریپوها

| ریپو | شاخه اصلی | کاربرد |
|---|---|---|
| `hayula` | `master` | **این ریپو** — SETUP.md، voice/، notes-plugin، mcp-search و درسنامه (همه subtree) |
| `opencode` | `notebook-memory` | فورک opencode با حافظه notebook (نسخه سبک: اسنپ‌شات upstream + کامیت‌های خودم) — ریپوی جدا |
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

همه‌چیز جز opencode داخل همین ریپو (hayula) است؛ فقط opencode جدا کلون می‌شود.

```bash
git clone git@github.com:SaeedAqamiri/hayula.git  ~/hayula   # SETUP.md + voice/ + notes-plugin + mcp-search + درسنامه
cd ~/hayula
git clone git@github.com:SaeedAqamiri/opencode.git opencode  # در ~/hayula/opencode (gitignored در hayula)

cd opencode
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
cd ~/hayula/mcp-search
uv sync         # .venv را از uv.lock می‌سازد
```

در `~/.config/opencode/opencode.jsonc`:

```jsonc
"mcp": {
  "web-search": {
    "type": "local",
    "command": ["/home/saeed/hayula/mcp-search/.venv/bin/python", "/home/saeed/hayula/mcp-search/server.py"],
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

زنجیره صدا: دکمه‌های opencode → پل `voice-control` (پورت ۸۱۷۹) → `whisper-server` (پورت ۸۱۷۸، مدل large-v3-turbo، زبان fa، **روی GPU**).

فایل‌های آماده در پوشه `voice/` همین ریپو هستند: اسکریپت `voice-control` و سه یونیت systemd — مسیرها با `%h` و `expanduser` قابل‌حمل‌اند و مستقل از نام یوزر.

### ۷.۱. whisper.cpp — بیلد CUDA و مدل

بیلد GPU بدون sudo — nvcc کامل از conda-forge (ویل‌های pip مثل `nvidia-cuda-nvcc-cu12` فقط `ptxas` دارند و برای بیلد به درد نمی‌خورند؛ micromamba از GitHub releases):

```bash
git clone https://github.com/ggml-org/whisper.cpp ~/opt/whisper.cpp
micromamba create -y -p ~/opt/cuda-env -c conda-forge \
  "cuda-nvcc=12.6" "cuda-cudart-dev=12.6" "cuda-cccl=12.6" "libcublas-dev=12.6"
cd ~/opt/whisper.cpp
CUDACXX=~/opt/cuda-env/bin/nvcc cmake -B build -DGGML_CUDA=1 \
  -DCMAKE_CUDA_ARCHITECTURES=native -DCUDAToolkit_ROOT=~/opt/cuda-env -DCMAKE_BUILD_TYPE=Release
cmake --build build --target whisper-server whisper-cli -j
```

مدل f16 (~۱.۶GB؛ بدون کوانتیزه — با ۸GB VRAM جا می‌شود). تبدیل از نسخه HF (transformers) با اسکریپت خود whisper.cpp که به `mel_filters.npz` ریپوی openai/whisper نیاز دارد؛ پایتون باید torch و transformers داشته باشد:

```bash
git clone --depth 1 https://github.com/openai/whisper ~/opt/whisper
mkdir -p ~/.local/share/whisper-cpp /tmp/ggml-out
<path-python-with-torch> ~/opt/whisper.cpp/models/convert-h5-to-ggml.py \
  ~/models/whisper-large-v3-turbo ~/opt/whisper /tmp/ggml-out
mv /tmp/ggml-out/ggml-model.bin ~/.local/share/whisper-cpp/ggml-large-v3-turbo.bin
cp ~/opt/whisper.cpp/models/for-tests-silero-v6.2.0-ggml.bin ~/.local/share/whisper-cpp/   # مدل VAD
```

VAD (silero) در یونیت `whisper-server` فعاله — بدون آن روی سکوت هذیون می‌سازد (مثلاً «PYM JBZ») به‌جای متن خالی.

### ۷.۲. نصب پل و سرویس‌ها

```bash
sudo apt install sox            # voice-control برای ساخت wav پروب به sox نیاز دارد

cd ~/hayula/voice
cp voice-control ~/.local/bin/voice-control && chmod +x ~/.local/bin/voice-control
cp whisper-server.service voice-control.service mic-fix.service ~/.config/systemd/user/
systemctl --user daemon-reload
```

### ۷.۲.۱. گین میکروفون (mic-fix)

اگر `Internal Mic Boost` و `Capture` همزمان ماکزیمم باشند (~۶۰dB مجموع)، بایاس میکروفون ADC را اشباع می‌کند: ضبط آفست DC بزرگ می‌گیرد، کلیپ می‌شود و whisper رویش هذیون می‌گوید. یونیت `mic-fix.service` موقع هر لاگین boost را صفر و capture را ~۱۷dB می‌کند (در تست، DC از ۰.۶۵- به ۰.۰۲ رسید). اگر کارت صدای سیستم متفاوت است، `-c PCH` داخل یونیت را با `cat /proc/asound/cards` اصلاح کن. تشخیص: `arecord -d 3` بعد `sox x.wav -n stats` — DC باید حدود صفر باشد.

### ۷.۳. کلید پروایدر صوتی

پلاگین صوتی از `apiKeyEnv: ZAI_API_KEY` می‌خواند — در `~/.bashrc`:

```bash
export ZAI_API_KEY="<کلید Z.AI — همان opencode.jsonc>"
```

### ۷.۴. فعال‌سازی

```bash
systemctl --user enable --now voice-control   # پل ۸۱۷۹ — همیشه روشن (سبک است)
systemctl --user enable --now whisper-server  # STT ۸۱۷۸ روی GPU (~۱.۹GB VRAM) — toggle دارد
systemctl --user enable --now mic-fix         # گین میکروفون — هر لاگین اجرا می‌شود
```

دکمه «whisper toggle» در opencode همین سرویس را خاموش/روشن می‌کند؛ لازم نیست دائمی بماند. دکمه ضبط هم اگر whisper خاموش باشد، خودش از طریق پل روشنش می‌کند.

### ۷.۵. تأیید صدا

```bash
curl -s http://127.0.0.1:8179/status            # باید {"state":"..."} بدهد
curl -s -X POST http://127.0.0.1:8179/up        # روشن‌کردن whisper و انتظار تا آماده شود

# تست سکوت — باید متن خالی بدهد، نه هذیون:
sox -n -r 16000 -c 1 /tmp/silence.wav trim 0 2
curl -s http://127.0.0.1:8178/audio/transcriptions -F file=@/tmp/silence.wav -F "response_format=json"

# تست میکروفون — DC باید حدود صفر باشد:
arecord -D pulse -f S16_LE -r 16000 -c 1 -d 3 /tmp/m.wav && sox /tmp/m.wav -n stats | grep -E "DC|RMS"

# حالا در opencode دکمه ضبط را بزن و فارسی حرف بزن
```

## نکات نگهداری

- **notes-plugin، mcp-search و درسنامه** به‌صورت subtree داخل همین ریپو هستند — توسعه‌شان درجا انجام می‌شود و با hayula پوش می‌شوند. ریپوهای قدیمی‌شان روی گیت‌هاب (`SaeedAqamiri/notes-plugin`، `mcp-search`، `agentic-ai-course`) فقط **آرشیو منجمد**اند و آپدیت نمی‌شوند.
- opencode و opencti روی گیت‌هاب **نسخه سبک**‌اند (اسنپ‌شات upstream + کامیت‌های خودم)؛ تاریخچه کامل upstream عمداً پوش نشده است.
- برای به‌روزرسانی از upstream: `git fetch origin` در ریپوی opencode/opencti محلی، سپس rebase و `git push fork`.
- فایل‌های `.note.yaml` حافظه محلی‌اند و بین سیستم‌ها منتقل نمی‌شوند (طراحی بی‌خیال).
