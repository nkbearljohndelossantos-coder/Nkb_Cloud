using System;
using System.IO;
using System.Diagnostics;
using NkbDrive.Client.Storage;

namespace NkbDrive.Client
{
    public class ScaleBenchmark
    {
        public static void Main(string[] args)
        {
            string dbPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NKB Drive", "scale_benchmark.db");
            if (File.Exists(dbPath)) File.Delete(dbPath);

            Console.WriteLine("[BENCHMARK] Inserting 10,000 file metadata records...");
            Stopwatch sw = Stopwatch.StartNew();
            using (SyncMetadataRepository repo = new SyncMetadataRepository(dbPath))
            {
                repo.BeginTransaction();
                for (int i = 1; i <= 10000; i++)
                {
                    LocalFileRecord record = new LocalFileRecord
                    {
                        FileId = "scale-file-" + i,
                        RelativePath = "\\IT STAFF\\Documents\\Batch_" + (i / 500) + "\\File_" + i + ".dat",
                        Name = "File_" + i + ".dat",
                        SizeBytes = 1024 * (i % 50 + 1),
                        Sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                        SyncState = (i % 5 == 0) ? "OFFLINE_PINNED" : "ONLINE_ONLY",
                        ServerUpdatedAt = "2026-11-13T12:00:00.000Z",
                        LocalUpdatedAt = "2026-11-13T12:00:00.000Z"
                    };
                    repo.UpsertFile(record);
                }
                repo.Commit();
            }
            sw.Stop();
            long insertMs = sw.ElapsedMilliseconds;
            Console.WriteLine("[BENCHMARK] 10k Insert Duration: " + insertMs + " ms");

            Console.WriteLine("[BENCHMARK] Querying 10,000 files...");
            sw.Restart();
            int count = 0;
            using (SyncMetadataRepository repo = new SyncMetadataRepository(dbPath))
            {
                count = repo.CountFiles();
                var recent = repo.ListRecentFiles(100);
            }
            sw.Stop();
            long queryMs = sw.ElapsedMilliseconds;
            Console.WriteLine("[BENCHMARK] 10k Query Duration: " + queryMs + " ms (Count: " + count + ")");

            if (File.Exists(dbPath)) File.Delete(dbPath);
            Console.WriteLine("[BENCHMARK] COMPLETED_SUCCESSFULLY");
        }
    }
}
