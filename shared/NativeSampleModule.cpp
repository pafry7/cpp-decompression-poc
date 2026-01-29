#include "NativeSampleModule.h"
#include <zlib.h>
#include <sstream>
#include <cstdio>
#include <vector>
#include <sys/stat.h>

#ifdef __ANDROID__
#include <op-engineering_op-sqlite/sqlite3.h>
#else
#include <op-sqlite/sqlite3.h>
#endif

namespace facebook::react {

NativeSampleModule::NativeSampleModule(std::shared_ptr<CallInvoker> jsInvoker)
    : NativeSampleModuleCxxSpec(std::move(jsInvoker)) {}

std::string NativeSampleModule::reverseString(jsi::Runtime& rt, std::string input) {
  return std::string(input.rbegin(), input.rend());
}

std::string NativeSampleModule::decompressGzip(jsi::Runtime& rt, std::string filePath) {
  struct stat fileStat;
  if (stat(filePath.c_str(), &fileStat) != 0) {
    return "{\"error\":\"Failed to stat file: " + filePath + "\"}";
  }
  off_t compressedSize = fileStat.st_size;

  gzFile gz = gzopen(filePath.c_str(), "rb");
  if (!gz) {
    return "{\"error\":\"Failed to open file: " + filePath + "\"}";
  }

  std::vector<char> result;
  char buffer[65536];
  int bytesRead;

  while ((bytesRead = gzread(gz, buffer, sizeof(buffer))) > 0) {
    result.insert(result.end(), buffer, buffer + bytesRead);
  }

  if (bytesRead < 0) {
    gzclose(gz);
    return "{\"error\":\"gzread failed\"}";
  }

  gzclose(gz);

  std::ostringstream json;
  json << "{\"compressedSize\":" << compressedSize
       << ",\"decompressedSize\":" << result.size() << "}";
  return json.str();
}

std::string NativeSampleModule::applySqliteDelta(jsi::Runtime& rt, std::string deltaDbPath, std::string mainDbPath) {
  sqlite3* mainDb = nullptr;
  bool attached = false;
  std::string result;

  auto cleanup = [&]() {
    if (attached) sqlite3_exec(mainDb, "DETACH DATABASE delta", nullptr, nullptr, nullptr);
    if (mainDb) sqlite3_close(mainDb);
  };

  int rc = sqlite3_open_v2(mainDbPath.c_str(), &mainDb,
    SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nullptr);
  if (rc != SQLITE_OK) {
    result = "{\"error\":\"Failed to open main DB: " + std::string(sqlite3_errmsg(mainDb)) + "\"}";
    cleanup();
    return result;
  }

  char* errMsg = nullptr;

  // Enable WAL mode to reduce contention with PowerSync's connection
  sqlite3_exec(mainDb, "PRAGMA journal_mode=WAL", nullptr, nullptr, nullptr);

  // Create the users table if it doesn't exist yet
  rc = sqlite3_exec(mainDb,
    "CREATE TABLE IF NOT EXISTS users ("
    "id INTEGER PRIMARY KEY, "
    "created_at TEXT NOT NULL, "
    "name TEXT NOT NULL"
    ")",
    nullptr, nullptr, &errMsg);
  if (rc != SQLITE_OK) {
    result = "{\"error\":\"Failed to create users table: " + std::string(errMsg ? errMsg : "unknown error") + "\"}";
    sqlite3_free(errMsg);
    cleanup();
    return result;
  }

  // Attach delta database (use sqlite3_mprintf to safely quote the path)
  char* attachSql = sqlite3_mprintf("ATTACH DATABASE %Q AS delta", deltaDbPath.c_str());
  rc = sqlite3_exec(mainDb, attachSql, nullptr, nullptr, &errMsg);
  sqlite3_free(attachSql);
  if (rc != SQLITE_OK) {
    result = "{\"error\":\"Failed to attach delta DB: " + std::string(errMsg ? errMsg : "unknown error") + "\"}";
    sqlite3_free(errMsg);
    cleanup();
    return result;
  }
  attached = true;

  // Merge delta into main
  rc = sqlite3_exec(mainDb,
    "INSERT OR REPLACE INTO users SELECT * FROM delta.users",
    nullptr, nullptr, &errMsg);
  if (rc != SQLITE_OK) {
    result = "{\"error\":\"Failed to merge delta: " + std::string(errMsg ? errMsg : "unknown error") + "\"}";
    sqlite3_free(errMsg);
    cleanup();
    return result;
  }

  cleanup();
  std::remove(deltaDbPath.c_str());

  return "{}";
}

} // namespace facebook::react
