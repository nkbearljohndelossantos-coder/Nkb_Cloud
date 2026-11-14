using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace NkbDrive.Client.Sync
{
    public static class FileHashUtility
    {
        public static string ComputeSha256(string filePath)
        {
            if (!File.Exists(filePath)) return null;

            using (FileStream stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            using (SHA256 sha256 = SHA256.Create())
            {
                byte[] hashBytes = sha256.ComputeHash(stream);
                StringBuilder sb = new StringBuilder(64);
                foreach (byte b in hashBytes)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }

        public static string ComputeSha256(byte[] data)
        {
            if (data == null) return null;

            using (SHA256 sha256 = SHA256.Create())
            {
                byte[] hashBytes = sha256.ComputeHash(data);
                StringBuilder sb = new StringBuilder(64);
                foreach (byte b in hashBytes)
                {
                    sb.Append(b.ToString("x2"));
                }
                return sb.ToString();
            }
        }
    }
}
