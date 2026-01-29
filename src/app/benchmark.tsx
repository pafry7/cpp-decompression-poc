import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system";
import pako from "pako";
import SampleTurboModule from "../../specs/NativeSampleModule";

const FILE_NAME = "benchmark_test.tgz"
const MAIN_DB_PATH = "/data/data/com.anonymous.thoughtsjournal/databases/app.db";

function generateTestData(sizeBytes: number): Uint8Array {
  const line = new TextEncoder().encode("The quick brown fox jumps over the lazy dog.\n");
  const result = new Uint8Array(sizeBytes);
  for (let i = 0; i < sizeBytes; i++) {
    result[i] = line[i % line.length];
  }
  return result;
}

type BenchmarkResult = {
  compressedSize: number;
  decompressedSize: number;
  pakoDurationMs: number;
  zlibDurationMs: number;
  speedup: number;
};

async function runBenchmark(sizeMB: number): Promise<BenchmarkResult> {
  const sizeBytes = sizeMB * 1024 * 1024;

  // Generate and compress test data
  const rawData = generateTestData(sizeBytes);
  const compressed = pako.gzip(rawData);

  // Write compressed data to file
  const file = new FileSystem.File(FileSystem.Paths.cache, "benchmark_test.tgz");
  file.write(compressed);

  // JS benchmark: file read + pako decompression
  // We are reusing the same `file` object, what may affect the results
  const pakoStart = performance.now();
  const compressedFromFile = await file.bytes();
  const pakoResult = pako.ungzip(compressedFromFile);
  const pakoEnd = performance.now();
  const pakoDurationMs = pakoEnd - pakoStart;

  // C++ benchmark: zlib decompression (measured from JS to include bridge overhead)
  const FILE_PATH = FileSystem.Paths.cache.uri + FILE_NAME;
  const nativePath = FILE_PATH.replace("file://", "");
  const zlibStart = performance.now();
  const zlibResultJson = SampleTurboModule.decompressGzip(nativePath); // it is a synchronous call blocking the UI
  const zlibEnd = performance.now();
  const zlibDurationMs = zlibEnd - zlibStart;
  const zlibResult = JSON.parse(zlibResultJson);

  if (zlibResult.error) {
    throw new Error(zlibResult.error);
  }

  // Verify sizes match
  if (pakoResult.length !== zlibResult.decompressedSize) {
    Alert.alert(
      "Mismatch",
      `pako: ${pakoResult.length} bytes, zlib: ${zlibResult.decompressedSize} bytes`
    );
  }

  return {
    compressedSize: compressed.length,
    decompressedSize: pakoResult.length,
    pakoDurationMs,
    zlibDurationMs,
    speedup: pakoDurationMs / zlibDurationMs,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSpeed(bytes: number, ms: number): string {
  const mbPerSec = bytes / 1024 / 1024 / (ms / 1000);
  return `${mbPerSec.toFixed(1)} MB/s`;
}

export default function BenchmarkScreen() {
  const { top } = useSafeAreaInsets();
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);

  const handleApplyDelta = () => {
    // Push the delta file first: adb push scripts/delta.db /data/local/tmp/delta.db
    const deltaPath = "/data/local/tmp/delta.db";

    try {
      setMergeStatus("Merging...");
      const start = performance.now();
      const resultJson = SampleTurboModule.applySqliteDelta(
        deltaPath,
        MAIN_DB_PATH
      );
      const durationMs = performance.now() - start;
      const result = JSON.parse(resultJson);

      if (result.error) {
        setMergeStatus(`Error: ${result.error}`);
      } else {
        setMergeStatus(`Merged in ${durationMs.toFixed(2)} ms`);
      }
    } catch (e) {
      setMergeStatus(`Error: ${e}`);
    }
  };

  const handleRunBenchmark = async () => {
    setRunning(true);
    setResults([]);
    try {
      const r1 = await runBenchmark(1);
      setResults([r1]);
      const r10 = await runBenchmark(10);
      setResults([r1, r10]);
      const r100 = await runBenchmark(100);
      setResults([r1, r10, r100]);
    } catch (e) {
      Alert.alert("Error", String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <View className="flex-1 bg-gray-50">
      <View
        style={{ paddingTop: top }}
        className="bg-white border-b border-gray-200"
      >
        <View className="px-4 py-4">
          <Text className="text-2xl font-bold text-gray-900">
            Gzip Benchmark
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            pako (JS) vs zlib (C++)
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="p-4">
        <TouchableOpacity
          className={`rounded-xl py-4 px-6 mb-6 ${running ? "bg-gray-400" : "bg-blue-500"}`}
          onPress={handleRunBenchmark}
          disabled={running}
        >
          <Text className="text-white text-center text-lg font-semibold">
            {running ? "Running..." : "Run Benchmark (1MB, 10MB, 100MB)"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-xl py-4 px-6 mb-2 bg-green-600"
          onPress={handleApplyDelta}
        >
          <Text className="text-white text-center text-lg font-semibold">
            Apply SQLite Delta
          </Text>
        </TouchableOpacity>

        {mergeStatus && (
          <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200">
            <Text className="text-base text-gray-900">{mergeStatus}</Text>
          </View>
        )}

        {results.map((r, i) => (
          <View
            key={i}
            className="bg-white rounded-xl p-5 mb-4 border border-gray-200"
          >
            <Text className="text-lg font-bold text-gray-900 mb-3">
              {formatBytes(r.compressedSize)} compressed
            </Text>

            <View className="mb-2">
              <Text className="text-sm text-gray-500">Decompressed size</Text>
              <Text className="text-base text-gray-900">
                {formatBytes(r.decompressedSize)}
              </Text>
            </View>

            <View className="flex-row mb-2">
              <View className="flex-1">
                <Text className="text-sm text-gray-500">pako (JS)</Text>
                <Text className="text-base text-gray-900">
                  {r.pakoDurationMs.toFixed(2)} ms
                </Text>
                <Text className="text-xs text-gray-400">
                  {formatSpeed(r.decompressedSize, r.pakoDurationMs)}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm text-gray-500">zlib (C++)</Text>
                <Text className="text-base text-gray-900">
                  {r.zlibDurationMs.toFixed(2)} ms
                </Text>
                <Text className="text-xs text-gray-400">
                  {formatSpeed(r.decompressedSize, r.zlibDurationMs)}
                </Text>
              </View>
            </View>

            <View className="bg-green-50 rounded-lg p-3 mt-2">
              <Text className="text-green-800 font-semibold text-center">
                C++ is {r.speedup.toFixed(1)}x faster
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
