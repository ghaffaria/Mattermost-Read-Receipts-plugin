# ساخت اندروید

مبنای رسمی v2.46.0، commit `655df13b131da6810f4f073622c925af1b87c3fb` است. نسخهٔ جداگانه 2.46.0-rr.1 با شناسهٔ `com.pardis.mattermost.readreceipts.qa` کنار اپ رسمی نصب می‌شود. فایل APK در Releases است.

از ریشهٔ مخزن:

```sh
python3 mobile/android/prepare.py /absolute/new/path/mobile-rr
cd /absolute/new/path/mobile-rr
npx --yes npm@11 ci --ignore-scripts
```

Node 24.15.0، JDK17، SDK36، NDK27.1.12297006 و CMake3.22.1 لازم است. مقصد موجود بازنویسی نمی‌شود؛ checksum سورس کنترل می‌شود.

یک فایل خصوصی با مجوز600 حاوی store_file، store_password و key_alias برای keystore خودتان بسازید. کلید و رمز را وارد Git نکنید. برای به‌روزرسانی همین نصب امضای ثابت لازم است.

```sh
export RR_JAVA_HOME=/absolute/path/to/jdk17
export ANDROID_SDK_ROOT=/absolute/path/to/android-sdk
export RR_QA_SIGNING_CONFIG=/absolute/private/signing.json
bash scripts/build-read-receipts-qa.sh
```

خروجی android/app/build/outputs/apk/release/app-release.apk است. APK منتشرشده arm64/API30+، target36 و دارای امضای QA است. اپ رسمی را حذف یا داده‌هایش را پاک نکنید. Push اختصاصی تنظیم نشده است. [راهنمای انگلیسی](../../docs/ANDROID.md)، [آزمون‌ها](../../docs/VALIDATION.fa.md).
