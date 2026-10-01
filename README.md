# PIM Smart Work Report Online

## Arsitektur
- GitHub Pages: frontend PWA
- Supabase: Authentication, PostgreSQL, private photo storage
- GitHub Actions: Excel berfoto + Gmail setiap 07:00 WIB

## 1. Buat Supabase
1. Buat project di supabase.com.
2. SQL Editor -> New Query -> tempel seluruh `supabase/schema.sql` -> Run.
3. Authentication -> Users -> Add user. Buat akun Operator, Teknisi, Supervisor, Admin.
4. Salin UUID masing-masing user.
5. Table Editor -> profiles -> Insert row: `id=UUID auth user`, `full_name`, `role` (`operator`, `technician`, `supervisor`, `admin`).
6. Project Settings -> API: salin Project URL, anon key, dan service_role key. Service role jangan pernah dimasukkan frontend.

## 2. Konfigurasi frontend
1. Salin `public/config.example.js` menjadi `public/config.js`.
2. Isi SUPABASE_URL dan SUPABASE_ANON_KEY. Anon key memang untuk client, keamanan data ditentukan RLS.
3. Jangan masukkan service_role key atau Gmail password ke config.js.

## 3. Upload GitHub
1. Buat repository. Untuk GitHub Pages gratis paling sederhana gunakan Public. Jangan masukkan data/foto/password nyata ke repository.
2. Upload seluruh isi folder ini.
3. Settings -> Pages -> Build and deployment -> GitHub Actions.
4. Tambah workflow deploy Pages atau pindahkan isi `public` ke root. Cara termudah: upload isi folder public ke root repository, tetapi pertahankan folder `.github` dan `scripts`.
5. Alternatif rapi: Settings -> Pages -> Deploy from branch, branch main, folder `/docs`; rename `public` menjadi `docs`.
6. Pastikan `config.js` sudah ada pada folder yang dipublikasikan.

## 4. Secrets GitHub untuk report pagi
Settings -> Secrets and variables -> Actions -> New repository secret:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- GMAIL_USER
- GMAIL_APP_PASSWORD
- REPORT_TO (boleh beberapa email dipisahkan koma)

Workflow dijadwalkan `0 0 * * *`, yaitu 00:00 UTC = 07:00 WIB. Dapat dites melalui Actions -> Daily Excel Report -> Run workflow. Jadwal GitHub dapat terlambat beberapa menit dan tidak direkomendasikan untuk proses kritis.

## 5. Gmail
Aktifkan 2-Step Verification, buat App Password, simpan App Password hanya dalam GitHub Secret `GMAIL_APP_PASSWORD`. Email pabrik hanya dimasukkan ke `REPORT_TO`.

## 6. Import 1.000 mesin
Isi `master_mesin_template.csv`. Supabase -> Table Editor -> machines -> Insert -> Import CSV. Pastikan code unik.

## 7. Pengujian alur
1. Login Operator -> Lapor -> foto temuan.
2. Login Teknisi -> Jobs -> isi penyebab/tindakan/foto -> Request Check.
3. Login Operator -> Verifikasi -> foto -> Closed atau Returned.
4. Login Supervisor -> Report -> Download Excel + Foto.
5. GitHub Actions -> Run workflow -> cek email penerima.

## Catatan keamanan
- Bucket foto private.
- RLS aktif.
- Gunakan akun individual, bukan akun bersama.
- Service role key hanya di GitHub Secrets.
- Repository public berarti source terlihat orang lain; source tidak boleh mengandung rahasia. Untuk source private + hosting gratis, gunakan Cloudflare Pages/Netlify yang terhubung ke GitHub private.
- Lakukan pilot sebelum memasukkan 1.000 mesin.
