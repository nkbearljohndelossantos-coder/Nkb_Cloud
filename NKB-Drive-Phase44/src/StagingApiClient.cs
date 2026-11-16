using System;
using System.IO;
using System.Net;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using NkbDrive.Client.Sync;

namespace NkbDrive.Client
{
    public class StagingApiClient
    {
        private readonly string _baseUrl;
        private string _token;
        private string _deviceId;
        private readonly JavaScriptSerializer _serializer;

        static StagingApiClient()
        {
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            }
            catch {}
            try
            {
                ServicePointManager.SecurityProtocol |= (SecurityProtocolType)12288;
            }
            catch {}
            try
            {
                ServicePointManager.Expect100Continue = false;
                ServicePointManager.DefaultConnectionLimit = 50;
                ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, sslPolicyErrors) => true;
                WebRequest.DefaultWebProxy = null;
            }
            catch {}
        }

        public StagingApiClient(string baseUrl = "http://127.0.0.1:5000")
        {
            _baseUrl = (baseUrl ?? "https://nkbcloud.nkbmanufacturing.com").TrimEnd('/');
            _serializer = new JavaScriptSerializer();
        }

        public string BaseUrl { get { return _baseUrl; } }
        public string Token { get { return _token; } set { _token = value; } }
        public string DeviceId { get { return _deviceId; } set { _deviceId = value; } }

        private HttpWebRequest CreateRequest(string method, string relativePath)
        {
            string url = _baseUrl + (relativePath.StartsWith("/") ? relativePath : "/" + relativePath);
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            req.Proxy = null;
            req.ServicePoint.Expect100Continue = false;
            req.KeepAlive = true;
            req.Timeout = 30000;
            req.ReadWriteTimeout = 45000;
            if (!string.IsNullOrEmpty(_token))
            {
                req.Headers["Authorization"] = "Bearer " + _token;
            }
            if (!string.IsNullOrEmpty(_deviceId))
            {
                req.Headers["x-device-id"] = _deviceId;
            }
            return req;
        }

        public Dictionary<string, object> Login(string email, string password)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/auth/login");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> {
                { "identifier", email },
                { "password", password }
            });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream())
            {
                s.Write(bytes, 0, bytes.Length);
            }

            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string json = r.ReadToEnd();
                    Dictionary<string, object> res = _serializer.Deserialize<Dictionary<string, object>>(json);
                    if (res != null && res.ContainsKey("token"))
                    {
                        _token = res["token"].ToString();
                    }
                    return res;
                }
            }
            catch (WebException wex)
            {
                if (wex.Response != null)
                {
                    using (StreamReader r = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                    {
                        string errBody = r.ReadToEnd();
                        try
                        {
                            var errObj = _serializer.Deserialize<Dictionary<string, object>>(errBody);
                            if (errObj != null && errObj.ContainsKey("error"))
                            {
                                throw new InvalidOperationException(errObj["error"].ToString());
                            }
                        }
                        catch (InvalidOperationException) { throw; }
                        catch {}
                    }
                }
                throw;
            }
        }

        public Dictionary<string, object> RegisterDevice(string machineName, string fingerprint, string osVersion, string clientVersion)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/v1/drive/devices/register");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> {
                { "machineName", machineName },
                { "hardwareFingerprint", fingerprint },
                { "osVersion", osVersion },
                { "clientVersion", clientVersion }
            });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream())
            {
                s.Write(bytes, 0, bytes.Length);
            }

            try
            {
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string json = r.ReadToEnd();
                    Dictionary<string, object> res = _serializer.Deserialize<Dictionary<string, object>>(json);
                    if (res != null && res.ContainsKey("device"))
                    {
                        Dictionary<string, object> dev = res["device"] as Dictionary<string, object>;
                        if (dev != null && dev.ContainsKey("id"))
                        {
                            _deviceId = dev["id"].ToString();
                        }
                    }
                    return res;
                }
            }
            catch (WebException wex)
            {
                if (wex.Response != null)
                {
                    using (StreamReader r = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
                    {
                        string errBody = r.ReadToEnd();
                        try
                        {
                            var errObj = _serializer.Deserialize<Dictionary<string, object>>(errBody);
                            if (errObj != null && errObj.ContainsKey("error"))
                            {
                                throw new InvalidOperationException(errObj["error"].ToString());
                            }
                        }
                        catch (InvalidOperationException) { throw; }
                        catch {}
                    }
                }
                throw;
            }
        }

        public Dictionary<string, object> ApproveDevice(string deviceId, string adminToken)
        {
            string origToken = _token;
            _token = adminToken;
            try
            {
                HttpWebRequest req = CreateRequest("POST", "/api/v1/drive/devices/" + deviceId + "/approve");
                req.ContentType = "application/json";
                byte[] bytes = Encoding.UTF8.GetBytes("{}");
                req.ContentLength = bytes.Length;
                using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
                }
            }
            finally
            {
                _token = origToken;
            }
        }

        public Dictionary<string, object> RevokeDevice(string deviceId)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/v1/drive/devices/" + deviceId + "/revoke");
            req.ContentType = "application/json";
            byte[] bytes = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> GetMyDevice()
        {
            HttpWebRequest req = CreateRequest("GET", "/api/v1/drive/devices/my-device");
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> GetDriveTree()
        {
            HttpWebRequest req = CreateRequest("GET", "/api/v1/drive/tree");
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> GetChanges(long cursor)
        {
            HttpWebRequest req = CreateRequest("GET", "/api/v1/drive/changes?cursor=" + cursor);
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> ValidateVersion(string fileId, int clientVersion, string clientSha256)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/v1/drive/files/validate-version");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> {
                { "fileId", fileId },
                { "clientVersion", clientVersion },
                { "clientSha256", clientSha256 }
            });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> CreateConflictCopy(string fileId, string clientSha256, string deviceName)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/v1/drive/files/conflict-copy");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> {
                { "fileId", fileId },
                { "clientSha256", clientSha256 },
                { "deviceName", deviceName }
            });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public string DownloadFile(string fileId, string targetPath, string expectedSha256 = null, long resumeOffset = 0, long maxBytes = -1)
        {
            string dir = Path.GetDirectoryName(targetPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            string tempFile = targetPath + ".downloading";

            HttpWebRequest req = CreateRequest("GET", "/api/files/" + fileId + "/download");
            if (resumeOffset > 0)
            {
                req.AddRange(resumeOffset);
            }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (Stream inStream = resp.GetResponseStream())
            using (FileStream outStream = new FileStream(tempFile, resumeOffset > 0 ? FileMode.Append : FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] buffer = new byte[64 * 1024]; // 64 KB streaming buffer
                long totalBytes = resumeOffset;
                int read;
                while ((read = inStream.Read(buffer, 0, buffer.Length)) > 0)
                {
                    outStream.Write(buffer, 0, read);
                    totalBytes += read;
                    if (maxBytes > 0 && totalBytes >= maxBytes)
                    {
                        // Simulate network cut / bounded test read
                        break;
                    }
                }
            }

            if (maxBytes > 0)
            {
                return tempFile; // Return intermediate partial file
            }

            // Verify integrity
            string actualSha256 = FileHashUtility.ComputeSha256(tempFile);
            if (!string.IsNullOrEmpty(expectedSha256) && !string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase))
            {
                try { File.Delete(tempFile); } catch {}
                throw new InvalidOperationException("Integrity check failed: Expected " + expectedSha256 + " but got " + actualSha256);
            }

            if (File.Exists(targetPath))
            {
                File.Delete(targetPath);
            }
            File.Move(tempFile, targetPath);
            return targetPath;
        }

        public Dictionary<string, object> UploadDirect(string localFilePath, string parentFolderId = null, string uploadName = null)
        {
            if (!File.Exists(localFilePath)) throw new FileNotFoundException("Local file not found", localFilePath);

            using (WebClient wc = new WebClient())
            {
                wc.Proxy = null;
                if (!string.IsNullOrEmpty(_token))
                {
                    wc.Headers["Authorization"] = "Bearer " + _token;
                }
                if (!string.IsNullOrEmpty(_deviceId))
                {
                    wc.Headers["x-device-id"] = _deviceId;
                }

                string url = _baseUrl + "/api/files/upload/direct";
                byte[] responseBytes = wc.UploadFile(url, "POST", localFilePath);
                string json = Encoding.UTF8.GetString(responseBytes);
                return _serializer.Deserialize<Dictionary<string, object>>(json);
            }
        }

        public Dictionary<string, object> CreateFolder(string name, string parentFolderId = null)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/files/folder");
            req.ContentType = "application/json";
            var dict = new Dictionary<string, object> { { "name", name } };
            if (!string.IsNullOrEmpty(parentFolderId)) dict["parentId"] = parentFolderId;

            string body = _serializer.Serialize(dict);
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> RenameItem(string id, string newName)
        {
            HttpWebRequest req = CreateRequest("PUT", "/api/files/" + id + "/rename");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> {
                { "name", newName },
                { "newName", newName }
            });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> MoveItem(string id, string targetFolderId)
        {
            HttpWebRequest req = CreateRequest("PUT", "/api/files/" + id + "/move");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> { { "targetFolderId", targetFolderId } });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }

        public Dictionary<string, object> TrashItem(string id)
        {
            HttpWebRequest req = CreateRequest("POST", "/api/files/" + id + "/trash");
            req.ContentType = "application/json";
            string body = _serializer.Serialize(new Dictionary<string, object> { { "itemType", "file" } });
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentLength = bytes.Length;
            using (Stream s = req.GetRequestStream()) { s.Write(bytes, 0, bytes.Length); }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return _serializer.Deserialize<Dictionary<string, object>>(r.ReadToEnd());
            }
        }
    }
}
