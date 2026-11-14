using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace NkbDrive.Client.Security
{
    public class StoredCredentials
    {
        public string ServerUrl;
        public string AccessToken;
        public string DeviceId;
        public string UserEmail;
        public string MachineName;
        public DateTime StoredAt;
    }

    public class DpapiVault
    {
        private static readonly byte[] EntropyPrefix = Encoding.UTF8.GetBytes("NKB-Enterprise-DPAPI-Entropy-v2.1");
        private readonly string _vaultFilePath;

        public DpapiVault(string vaultFilePath)
        {
            _vaultFilePath = Path.GetFullPath(vaultFilePath);
            string dir = Path.GetDirectoryName(_vaultFilePath);
            if (!Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
        }

        public string VaultFilePath { get { return _vaultFilePath; } }

        private byte[] GetCombinedEntropy()
        {
            string userIdentity = Environment.UserName + "@" + Environment.MachineName;
            byte[] userBytes = Encoding.UTF8.GetBytes(userIdentity);
            byte[] combined = new byte[EntropyPrefix.Length + userBytes.Length];
            Buffer.BlockCopy(EntropyPrefix, 0, combined, 0, EntropyPrefix.Length);
            Buffer.BlockCopy(userBytes, 0, combined, EntropyPrefix.Length, userBytes.Length);
            return combined;
        }

        public void SaveCredentials(StoredCredentials creds)
        {
            if (creds == null) throw new ArgumentNullException("creds");

            string serialized = string.Format(
                "{0}\n{1}\n{2}\n{3}\n{4}\n{5}",
                creds.ServerUrl ?? "",
                creds.AccessToken ?? "",
                creds.DeviceId ?? "",
                creds.UserEmail ?? "",
                creds.MachineName ?? "",
                creds.StoredAt.ToString("o")
            );

            byte[] plaintext = Encoding.UTF8.GetBytes(serialized);
            byte[] entropy = GetCombinedEntropy();
            byte[] ciphertext = ProtectedData.Protect(plaintext, entropy, DataProtectionScope.CurrentUser);

            File.WriteAllBytes(_vaultFilePath, ciphertext);
        }

        public StoredCredentials LoadCredentials()
        {
            if (!File.Exists(_vaultFilePath))
                return null;

            byte[] ciphertext = File.ReadAllBytes(_vaultFilePath);
            if (ciphertext.Length == 0) return null;

            byte[] entropy = GetCombinedEntropy();
            byte[] plaintext = ProtectedData.Unprotect(ciphertext, entropy, DataProtectionScope.CurrentUser);
            string serialized = Encoding.UTF8.GetString(plaintext);

            string[] parts = serialized.Split('\n');
            if (parts.Length < 6) return null;

            DateTime storedAt;
            DateTime.TryParse(parts[5], out storedAt);

            return new StoredCredentials
            {
                ServerUrl = parts[0],
                AccessToken = parts[1],
                DeviceId = parts[2],
                UserEmail = parts[3],
                MachineName = parts[4],
                StoredAt = storedAt
            };
        }

        public bool HasCredentials()
        {
            return File.Exists(_vaultFilePath) && new System.IO.FileInfo(_vaultFilePath).Length > 0;
        }

        public void Purge()
        {
            if (File.Exists(_vaultFilePath))
            {
                // Cryptographic zero-wipe to prevent disk remanence
                long len = new System.IO.FileInfo(_vaultFilePath).Length;
                byte[] zeros = new byte[Math.Max(len, 512)];
                File.WriteAllBytes(_vaultFilePath, zeros);
                File.Delete(_vaultFilePath);
            }
        }
    }
}
