# C++ decompression & applying sqlite delta files POC


1. Run `npm i`
2. Start the backend services as described in: https://expo.dev/blog/what-synced-in-app-sqlite-brings-to-expo-apps#select--from-journey-where-status--the-end
3. Run `npx expo run:android`
4. Run benchmark
5. Push the delta file `adb push scripts/delta.db /data/local/tmp/delta.db`
6. Apply delta file
7. Validate the result by following instructions from https://docs.powersync.com/maintenance-ops/client-database-diagnostics;
```
adb exec-out run-as com.anonymous.thoughtsjournal cat /data/data/com.anonymous.thoughtsjournal/databases/app.db > "app.sqlite"
adb exec-out run-as com.anonymous.thoughtsjournal cat /data/data/com.anonymous.thoughtsjournal/databases/app.db-wal > "app.sqlite-wal"
sqlite3 app.sqlite
> PRAGMA wal_checkpoint(TRUNCATE);
> select * from users;
```


# Expo Router and Tailwind CSS

Use [Expo Router](https://docs.expo.dev/router/introduction/) with [Nativewind](https://www.nativewind.dev/v4/overview/) styling.

## Launch your own

[![Launch with Expo](https://github.com/expo/examples/blob/master/.gh-assets/launch.svg?raw=true)](https://launch.expo.dev/?github=https://github.com/expo/examples/tree/master/with-tailwindcss)

## 🚀 How to use

```sh
npx create-expo-app -e with-tailwindcss
```

## Deploy

Deploy on all platforms with Expo Application Services (EAS).

- Deploy the website: `npx eas-cli deploy` — [Learn more](https://docs.expo.dev/eas/hosting/get-started/)
- Deploy on iOS and Android using: `npx eas-cli build` — [Learn more](https://expo.dev/eas)
