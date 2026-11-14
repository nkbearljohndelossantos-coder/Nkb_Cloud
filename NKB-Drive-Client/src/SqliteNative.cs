using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace NkbDrive.Client.Storage
{
    public static class SqliteNative
    {
        private const string DllName = "winsqlite3.dll";

        public const int SQLITE_OK = 0;
        public const int SQLITE_ROW = 100;
        public const int SQLITE_DONE = 101;

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode)]
        public static extern int sqlite3_open16(string filename, out IntPtr db);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_close(IntPtr db);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        public static extern int sqlite3_exec(IntPtr db, string sql, IntPtr callback, IntPtr arg, out IntPtr errmsg);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode)]
        public static extern int sqlite3_prepare16_v2(IntPtr db, string sql, int numBytes, out IntPtr stmt, IntPtr pzTail);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_step(IntPtr stmt);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_finalize(IntPtr stmt);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr sqlite3_errmsg16(IntPtr db);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr sqlite3_column_text16(IntPtr stmt, int iCol);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern long sqlite3_column_int64(IntPtr stmt, int iCol);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_column_int(IntPtr stmt, int iCol);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode)]
        public static extern int sqlite3_bind_text16(IntPtr stmt, int iCol, string val, int len, IntPtr dtor);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_bind_int64(IntPtr stmt, int iCol, long val);

        [DllImport(DllName, CallingConvention = CallingConvention.Cdecl)]
        public static extern int sqlite3_bind_null(IntPtr stmt, int iCol);

        public static string GetErrorMessage(IntPtr db)
        {
            IntPtr ptr = sqlite3_errmsg16(db);
            return ptr == IntPtr.Zero ? "Unknown SQLite error" : Marshal.PtrToStringUni(ptr);
        }
    }
}
