# Arsitektur Fitur Utama: Repository Analysis & Code-Rot Engine

Agar fitur analisis repositori di **Necro-Docs** bukan sekadar *mock data*, sistem harus mengeksekusi **5 tahap nyata** dalam satu alur cepat (kurang dari 3–5 detik) tanpa melakukan `git clone` ke disk server.

---

## 1. Workflow Sistem (Dari Link GitHub ke Kanvas Interaktif)

```
[Input URL GitHub] 
       │
       ▼
[1. URL Parser & Default Branch Resolver]
   • Ekstrak `owner` dan `repo` dari berbagai format URL.
   • Panggil `GET /repos/{owner}/{repo}` untuk mendapatkan `default_branch` (`main`/`master`).
       │
       ▼
[2. Zero-Clone Recursive Tree Fetcher]
   • Panggil `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`.
   • Saring file sampah (`node_modules`, `.next`, `dist`, `lockfiles`, gambar, test files).
   • Ambil maksimal 20–25 file kode inti (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`) berdasarkan prioritas folder (`src/`, `app/`, `lib/`, `server/`).
       │
       ▼
[3. Parallel Source Content Fetcher]
   • Ambil isi kode mentah (`raw content`) secara paralel (`Promise.all`) via `raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}` (jauh lebih cepat & hemat kuota API dibanding blob endpoint).
       │
       ▼
[4. Static AST / Regex Dependency & Code-Rot Analyzer]
   • Dependency Linker: Deteksi statement `import ... from '...'`, `require('...')`, dan `from ... import ...` lalu cocokkan dengan path file yang ada untuk membentuk `edges` (`{ from, to }`).
   • Code-Rot Calculator (0–100): Hitung skor tiap file berdasarkan metrik terukur + ekstrak 2–3 temuan spesifik (`findings`) beserta nomor barisnya.
       │
       ▼
[5. Auto-Layout Dagre/Layered Coordinates + JSON Response]
   • Hitung posisi koordinat `(x, y)` tiap node berdasarkan kedalaman dependensi (Upstream di kiri -> Hub di tengah -> Downstream di kanan) agar tidak bertumpuk di kanvas.
```

---

## 2. Rumus Perhitungan Code-Rot Score (0–100) & Findings Otomatis

Supaya skor `rot` yang muncul di UI benar-benar akurat dari isi kode asli, gunakan formula deterministik berikut:

1. **Volume Penalty (Maks 25 poin):**
   * Dihitung dari jumlah baris kode (`LOC`). Jika `LOC > 300`, poin naik proporsional.
2. **Nesting & Cyclomatic Complexity (Maks 30 poin):**
   * Hitung kedalaman kurung kurawal/indentasi maksimum dan kepadatan percabangan (`if`, `else if`, `switch`, `for`, `while`, `catch`).
3. **Silent Failure & Debt Patterns (Maks 30 poin):**
   * Deteksi pola berbahaya secara langsung di kode:
     * Empty/swallowed `catch (e) {}` tanpa `throw` atau logging jelas (`+18 poin`).
     * Penggunaan `any` berlebihan, `@ts-ignore`, atau `eval` (`+10 poin`).
     * Komentar hutang teknis: `TODO`, `FIXME`, `HACK`, `XXX`, `unsafe` (`+8 poin` per temuan).
4. **Coupling Blast Factor (Maks 15 poin):**
   * Semakin banyak file lain yang bergantung pada file ini (*in-degree* + *out-degree*), semakin tinggi risikonya jika file ini rusak.

Setiap pola yang terdeteksi otomatis dimasukkan ke array `findings: string[]` lengkap dengan nomor barisnya (contoh: `"Line 42: Empty catch block swallows runtime exceptions."`).

---

## 3. Struktur JSON Output Wajib (`POST /api/ingest`)

Frontend kanvas membutuhkan struktur JSON yang persis seperti ini agar langsung kompatibel dengan UI yang sudah kita buat:

```json
{
  "title": "owner/repo-name",
  "defaultBranch": "main",
  "rotSummary": "68% infected",
  "overallRot": 68,
  "nodes": [
    {
      "id": "src/billing/chargeEngine.ts",
      "name": "chargeEngine.ts",
      "path": "src/billing/chargeEngine.ts",
      "loc": 482,
      "rot": 94,
      "lastCommit": "Active branch",
      "x": 670,
      "y": 240,
      "findings": [
        "Line 142: Empty catch block swallows exceptions silently.",
        "High cyclomatic complexity (18 branches across 482 LOC)."
      ],
      "code": "// Potongan 35 baris kode paling kritis atau awal file..."
    }
  ],
  "edges": [
    {
      "from": "src/routes/payRouter.ts",
      "to": "src/billing/chargeEngine.ts"
    }
  ]
}
```

---

## 4. MASTER PROMPT UNTUK KIRO (Siap Copy-Paste)

Salin seluruh blok prompt di bawah ini dan masukkan ke **Kiro** (bisa di chat Spec atau langsung instruksi implementasi):

```text
Bangun fitur utama "Real-Time GitHub Repository Analysis & Code-Rot Engine" secara end-to-end untuk Necro-Docs. Pastikan fitur ini benar-benar menganalisis repositori GitHub publik sungguhan (bukan sekadar data dummy), dengan tetap menyediakan 3 preset fallback jika API rate-limit tercapai.

Kerjakan 4 komponen berikut secara lengkap:

1. Modul Parser & Analyzer (`src/lib/repoAnalyzer.ts`):
   - Buat fungsi `parseGitHubUrl(input: string)` yang menerima format `https://github.com/owner/repo`, `github.com/owner/repo`, atau `owner/repo` (bersihkan trailing `.git`, `/tree/...`, atau slash).
   - Fetch metadata repo dari `https://api.github.com/repos/{owner}/{repo}` (gunakan header `Authorization: Bearer ${process.env.GITHUB_TOKEN}` jika `GITHUB_TOKEN` tersedia di env) untuk mendapatkan `default_branch`.
   - Fetch file tree secara rekursif dari `https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1`.
   - Filter hanya file kode sumber (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`) dan abaikan folder non-inti (`node_modules`, `.next`, `dist`, `build`, `vendor`, `.git`, `__pycache__`, file `.test.` / `.spec.`, dan file konfigurasi). Prioritaskan file di dalam `src/`, `app/`, `lib/`, `server/`, atau `core/` dan batasi maksimal 22 file agar respons di bawah 4 detik.
   - Ambil isi raw file secara paralel (`Promise.all`) dari `https://raw.githubusercontent.com/{owner}/{repo}/{default_branch}/{path}`.
   - Resolusi Dependency (`edges`): Gunakan regex parser untuk mengekstrak relative imports pada JS/TS (`import ... from './...'`, `export ... from './...'`, `require('./...')`), TypeScript path aliases (`@/...`), dan Python imports. Cocokkan target import dengan daftar file yang berhasil di-index untuk menghasilkan array `edges: { from: string, to: string }[]`.
   - Perhitungan Code-Rot (`rot`: 0-100) & `findings`:
     Analisis isi tiap file secara nyata:
     a) Hitung jumlah baris (LOC).
     b) Hitung jumlah cabang logika (`if`, `switch`, `for`, `while`, `catch`, `&&`, `?`) dan kedalaman indentasi maksimum.
     c) Deteksi anti-pattern beserta nomor barisnya: empty catch blocks (`catch (...) { }`), komentar `TODO`/`FIXME`/`HACK`/`unsafe`, penggunaan `any` atau `@ts-ignore`, serta fungsi yang terlalu panjang.
     d) Hasilkan skor `rot` (0-100), daftar `findings: string[]` (2-4 diagnosis spesifik dengan nomor baris nyata dari file tersebut), dan `code` (potongan 30-45 baris kode paling relevan di sekitar temuan atau bagian utama file).
   - Perhitungan Auto-Layout Koordinat `(x, y)`:
     Susun node ke dalam kolom berlapis (layered topological columns dari kiri ke kanan berdasarkan aliran import: entrypoints di x=110, middleware/routers di x=390, core services/hotspots di x=670, storage/sinks di x=950) dan distribusikan `y` secara merata (jarak antar baris minimal 130px) agar node tidak saling menumpuk di kanvas.

2. Endpoint API (`src/app/api/ingest/route.ts`):
   - Buat handler `POST /api/ingest` yang menerima `{ repoUrl: string }`.
   - Validasi input, jalankan `analyzeRepository(repoUrl)`, hitung rata-rata/persentase infeksi (`rotSummary`, misal `"68% infected"` berdasarkan proporsi file dengan rot >= 50 atau rata-rata tertimbang), dan kembalikan JSON `{ title, defaultBranch, rotSummary, overallRot, nodes, edges }`.
   - Tangani error dengan pesan yang jelas (404 jika repo tidak ditemukan/private, 429 jika terkena rate limit GitHub).

3. State & Integrasi Frontend di Landing Page (`src/app/page.tsx`):
   - Sambungkan form input URL GitHub (`handleCustomRepo`) ke `POST /api/ingest`.
   - Tampilkan state loading yang jelas pada tombol ("Dissecting repository...") dan indikator tahap saat proses analisis berjalan.
   - Jika sukses, simpan hasil JSON ke `sessionStorage.setItem('necro_active_repo', JSON.stringify(data))` dan langsung tampilkan Workspace dengan grafik dari repo tersebut.

4. Integrasi Kanvas & Panel Autopsy (`src/app/workspace/page.tsx` atau view workspace):
   - Render `nodes` dan `edges` hasil analisis asli di atas kanvas interaktif.
   - Otomatis pilih node dengan skor `rot` tertinggi sebagai fokus awal di panel kanan (Autopsy Drawer) agar user langsung melihat hotspot paling berbahaya beserta `findings` dan potongan `code` aslinya.
```