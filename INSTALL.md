# راهنمای نصب و راه‌اندازی PMO

این سند قدم‌به‌قدم نصب **سامانه مدیریت پروژه (PMO)** را توضیح می‌دهد.

---

## پیش‌نیازها

### روش پیشنهادی (Docker)

- [Docker](https://docs.docker.com/get-docker/) نسخه ۲۰ یا بالاتر
- [Docker Compose](https://docs.docker.com/compose/) نسخه ۲ یا بالاتر (معمولاً داخل Docker Desktop است)

بررسی:

```bash
docker --version
docker compose version
```

### روش توسعه محلی (بدون Docker کامل)

- Node.js **۲۰** یا بالاتر
- npm
- PostgreSQL **۱۶** (یا فقط سرویس `db` از Docker)

بررسی:

```bash
node -v
npm -v
```

---

## ۱) دریافت پروژه

```bash
git clone <REPO_URL> pmo
cd pmo
```

اگر پروژه را به‌صورت ZIP دارید، آن را از حالت فشرده خارج کنید و وارد پوشه `pmo` شوید.

---

## ۲) اجرای سریع با Docker (پیشنهادی)

از ریشه پروژه:

```bash
docker compose up --build -d
```

اولین بار ممکن است چند دقیقه طول بکشد (دانلود ایمیج‌ها و build).

### آدرس‌ها

| سرویس | آدرس |
|--------|------|
| وب‌اپلیکیشن | http://localhost:3080 |
| API (از داخل شبکه Docker) | `backend:3001` — از بیرون معمولاً از طریق همان `3080/api` |

### حساب‌های پیش‌فرض (بعد از seed)

| نقش | ایمیل | رمز عبور |
|------|--------|-----------|
| مدیر | `admin@pmo.local` | `Admin@123` |
| کاربر | `dev@pmo.local` | `User@123` |
| کاربر | `frontend@pmo.local` | `User@123` |

> بلافاصله بعد از نصب، رمزها را عوض کنید.

### دستورات مفید Docker

```bash
# وضعیت کانتینرها
docker compose ps

# لاگ بک‌اند
docker compose logs -f backend

# لاگ فرانت
docker compose logs -f frontend

# توقف
docker compose down

# توقف + پاک کردن دیتابیس و آپلودها (خطرناک)
docker compose down -v
```

### پورت پیش‌فرض

فرانت روی پورت **3080** منتشر می‌شود (`3080:80` در `docker-compose.yml`).  
اگر پورت اشغال است، در `docker-compose.yml` آن را عوض کنید، مثلاً `8080:80`.

---

## ۳) نصب برای توسعه محلی

### ۳.۱ دیتابیس

ساده‌ترین راه: فقط Postgres را با Docker بالا بیاورید:

```bash
docker compose up -d db
```

اتصال پیش‌فرض:

```text
postgresql://pmo:pmo@localhost:5432/pmo?schema=public
```

> اگر پورت `5432` روی هاست expose نشده باشد، در `docker-compose.yml` برای سرویس `db` بخش `ports` اضافه کنید:

```yaml
ports:
  - "5432:5432"
```

سپس دوباره:

```bash
docker compose up -d db
```

### ۳.۲ بک‌اند

```bash
cd backend
cp .env.example .env
```

محتوای نمونه `.env`:

```env
DATABASE_URL=postgresql://pmo:pmo@localhost:5432/pmo?schema=public
JWT_SECRET=change-me-in-development
PORT=3001
```

نصب و راه‌اندازی:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
node prisma/seed.js
npm run start:dev
```

API روی:

```text
http://localhost:3001/api
```

آپلودها روی:

```text
http://localhost:3001/uploads
```

### ۳.۳ فرانت‌اند

در ترمینال جدید:

```bash
cd frontend
npm install
npm run dev
```

فرانت روی:

```text
http://localhost:5173
```

در حالت `dev`، درخواست‌های `/api` و `/uploads` و `/socket.io` به بک‌اند پروکسی می‌شوند.

---

## ۴) ساخت نسخه Production (بدون Docker Compose کامل)

### بک‌اند

```bash
cd backend
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
node prisma/seed.js
npm run start:prod
```

### فرانت‌اند

```bash
cd frontend
npm install
npm run build
```

خروجی در `frontend/dist` است و باید پشت Nginx/Apache سرو شود. نمونه تنظیم Nginx در `frontend/nginx.conf` آمده است (پروکسی `/api` و `/socket.io` و `/uploads`).

---

## ۵) تنظیمات مهم بعد از نصب

1. وارد پنل با کاربر ادمین شوید.
2. از منوی **گیت‌لب** آدرس سرور GitLab و Access Token را ذخیره کنید، سپس **تست اتصال** بزنید (ذخیره به‌تنهایی به‌معنای سالم بودن نیست).
3. در **تنظیمات** نام اپ، تگ‌لاین، لوگو و رنگ برند را تنظیم کنید.
4. کاربران و سمت‌ها را بسازید.
5. پروژه بسازید: نوع **نرم‌افزاری** برای اتصال گیت‌لب، یا **غیرنرم‌افزاری** بدون مخزن.
6. برای نصب روی موبایل: سایت را با HTTPS (یا localhost) باز کنید و **Add to Home Screen** بزنید؛ اعلان‌ها را Allow کنید.

### GitLab — توکن، وب‌هوک، محدودیت‌ها

**Scopeهای پیشنهادی توکن (Personal Access Token):** `api` یا حداقل `read_api` + دسترسی عضویت به پروژه‌ها. برای وب‌هوک و همگام‌سازی کامل، `api` ساده‌تر است.

**وب‌هوک (در GitLab پروژه → Settings → Webhooks):**
- URL: `https://YOUR_PMO_HOST/api/gitlab/webhooks`
- Secret token: همان مقدار ذخیره‌شده در تنظیمات گیت‌لب PMO (هدر `X-Gitlab-Token`)
- رویدادها: Push, Merge Request, Pipeline, Deployment (اختیاری)

**قواعد لینک خودکار:** در عنوان/پیام کامیت یا MR از `#123` یا `TASK-123` استفاده کنید (شناسه وظیفه در PMO).

**محدودیت‌ها:**
- فقط پروژه‌های نوع `SOFTWARE` به گیت‌لب وصل می‌شوند؛ بقیه رد می‌شوند.
- توکن با AES-256-GCM و کلید مشتق از `JWT_SECRET` رمز می‌شود؛ در پاسخ API خام برنمی‌گردد.
- همگام‌سازی دستی یا وب‌هوک؛ صف Redis/Bull فعلاً اضافه نشده.
- معیارهای داشبورد مهندسی از داده‌های ذخیره‌شده محاسبه می‌شوند (فرمول‌ها در `engineering.service.ts`).

**چک‌لیست پذیرش دستی:** ذخیره توکن → تست اتصال موفق → ساخت پروژه SOFTWARE + لینک مخزن → Sync → باز کردن وظیفه با `#id` در کامیت → دیدن تایم‌لاین → ارسال وب‌هوک تکراری (باید `duplicate: true`).

---

## ۶) قابلیت‌های اصلی بعد از نصب

- تابلو کانبان (موبایل و دسکتاپ)
- پروژه‌ها (نرم‌افزاری / غیرنرم‌افزاری) و مراحل گردش‌کار
- گفتگو (گروه، پیام خصوصی، ویس، تصویر، نظرسنجی، تیک خوانده‌شدن)
- اعلان درون‌برنامه‌ای و Web Push (PWA)
- ثبت و تأیید زمان کار
- GitLab Engineering: همگام‌سازی، وب‌هوک، تایم‌لاین، پایپلاین، وابستگی، داشبورد

---

## ۷) عیب‌یابی رایج

### `docker compose up` روی دیتابیس می‌ماند

```bash
docker compose logs db
docker compose ps
```

صبر کنید تا healthcheck سبز شود، بعد بک‌اند بالا می‌آید.

### خطای Prisma / migration

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

### صفحه سفید یا API 502 پشت Docker

```bash
docker compose logs backend --tail=100
docker compose restart backend frontend
```

### پورت 3080 اشغال است

در `docker-compose.yml` پورت فرانت را تغییر دهید و دوباره `up` کنید.

### نوتیفیکیشن روی موبایل نمی‌آید

- سایت باید HTTPS باشد (به‌جز localhost)
- در iOS حتماً به Home Screen اضافه شود
- اجازه Notification داده شود
- Service Worker (`/sw.js`) باید لود شود

### فضای دیسک کم هنگام build

```bash
docker system df
docker builder prune -f
```

---

## ۸) ساختار پوشه‌ها

```text
pmo/
├── backend/          # NestJS + Prisma + PostgreSQL + Socket.IO
├── frontend/         # React + Vite + Tailwind (RTL)
├── docker-compose.yml
├── README.md
└── INSTALL.md        # همین فایل
```

---

## ۹) متغیرهای محیطی خلاصه

| متغیر | کجا | توضیح |
|--------|------|--------|
| `DATABASE_URL` | backend | اتصال Postgres |
| `JWT_SECRET` | backend | کلید امضای توکن ورود |
| `PORT` | backend | پورت API (پیش‌فرض ۳۰۰۱) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | اختیاری | اگر نباشد، کلید Web Push خودکار ساخته می‌شود |
| `VITE_API_URL` | frontend build | پیش‌فرض `/api` |
| `VITE_UPLOADS_URL` | frontend build | پیش‌فرض `/uploads` |

---

اگر نصب را با Docker انجام می‌دهید، معمولاً فقط این کافی است:

```bash
cd pmo
docker compose up --build -d
```

سپس بروید به: **http://localhost:3080**
