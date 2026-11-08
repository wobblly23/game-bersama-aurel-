# 🏡 Desa Cinta Berdua 🌸
### Game Web Co-op Life-Sim & Survival Santai untuk Mabar Berdua

Game web yang dibuat khusus untuk kamu dan cewek kamu mabar online bersama secara real-time. Di sini kalian memiliki satu rumah bersama di pemukiman pedesaan yang asri, bisa bertani, memancing, memasak, mengelola bisnis kedai, dan bertahan hidup bersama!

---

## ✨ Fitur-Fitur Utama:
1. **Multiplayer Online Real-time (Sistem Room Code)**:
   - Cukup masukkan **Nama** dan **Kode Kamar yang sama** (contoh: `AUREL-KITA`).
   - Terdapat tombol **"Salin Link"** di pojok kiri atas untuk langsung mengirimkan link kamar ke pacar.
2. **Kehidupan Berpasangan & Rumah Bersama**:
   - 🛌 **Ranjang Berdua**: Tidur di ranjang bersama untuk melewati malam dan memulihkan 100% energi!
   - 🍳 **Dapur Memasak**: Buat masakan lezat seperti Salad Segar & Ikan Bakar Spesial.
   - 🎒 **Kulkas Bersama**: Semua bahan makanan, ikan, dan bibit disimpan di kulkas yang bisa diakses berdua.
   - 💌 **Papan Surat Cinta**: Tinggalkan catatan manis di dinding rumah yang bisa dibaca pasanganmu kapan saja.
3. **Interaksi Khusus Pasangan**:
   - 🤗 **Peluk (Hug)**: Animasi pelukan hangat dengan suara manis, memulihkan stamina berdua.
   - 😘 **Kiss (Cium)**: Efek ciuman mesra & menambah Love Points.
   - 🤝 **Gandengan Tangan (Hold Hands)**: Karakter pasangan akan otomatis berjalan beriringan mengikutimu kemana pun kamu pergi!
   - 💬 **Chatting & Emoticon**: Obrolan langsung di dalam game.
4. **Pekerjaan, Bisnis & Ekonomi**:
   - 🌾 **Berkebun / Bertani**: Cangkul 12 petak tanah, tanam bibit wortel / stroberi, siram air, dan panen bersama!
   - 🎣 **Memancing**: Memancing ikan segar di tepi danau yang tenang.
   - 🏪 **Toko Pak Joko (NPC)**: Jual hasil bumi & panen untuk menambah koin keluarga, atau beli bibit tanaman baru.
   - ☕ **Stan Bisnis Kedai**: Pajang makanan di depan rumah, NPC warga desa yang melintas akan mampir membeli dan memberi penghasilan pasif!
5. **Siklus Waktu & Suasana**:
   - Pagi cerah 🌅, Siang hangat ☀️, Senja romantis 🌇, dan Malam berbintang 🌙 dengan kunang-kunang yang menyala.
   - Musik santai & efek suara 8-bit manis bawaan browser (Web Audio API).

---

## 🎮 Cara Menjalankan Game:

### 1. Jalankan di Komputer / Laptop Kamu:
Cukup klik dua kali file **`start.bat`**  
Atau buka terminal di folder ini dan ketik:
```bash
npm start
```
Server akan aktif di: **`http://localhost:3000`**

### 2. Test Mabar di Laptop Sendiri:
- Buka browser tab 1: Masuk sebagai **Zahy** (Karakter Cowok, kode kamar `AUREL-KITA`).
- Buka browser tab 2 (atau jendela Incognito): Masuk sebagai **Aurel** (Karakter Cewek, kode kamar `AUREL-KITA`).
- Kalian berdua langsung berada di dalam satu dunia yang sama!

---

## 🌐 Cara Mabar dengan Pacar (Jarak Dekat atau Jarak Jauh):

### Opsi A: Mabar Satu Wi-Fi (Kamu di Laptop, Pacar di HP):
Jika kamu dan pacarmu terhubung ke Wi-Fi / Hotspot yang sama:
- Di HP pacar, buka browser dan ketik alamat IP laptopmu:
  ```
  http://10.160.197.225:3000
  ```
  *(Pastikan server `npm start` sedang aktif di laptop)*

### Opsi B: Mabar Jarak Jauh (Online Lewat Internet Bebas):
Buka terminal baru di laptop kamu, lalu jalankan salah satu alat pembuat link publik gratis ini:

**Menggunakan Localtunnel (Sangat Mudah tanpa daftar):**
```bash
npx localtunnel --port 3000
```
Terminal akan memberikan link publik (contoh: `https://desa-cinta-berdua.loca.lt`). Kirim link tersebut ke pacarmu, dan kalian bisa langsung mabar dari mana saja!

---

## 🕹️ Kontrol Permainan:
- **Laptop / PC**:
  - `W, A, S, D` atau `Tombol Panah`: Bergerak
  - `E`: Berinteraksi (Cangkul, Siram, Panen, Masak, Tidur, Buka Toko, Memancing)
- **HP / Layar Sentuh**:
  - D-Pad virtual di layar untuk berjalan
  - Tombol aksi di layar (Peluk, Kiss, Gandeng, Kulkas, Surat Cinta, Chat)

