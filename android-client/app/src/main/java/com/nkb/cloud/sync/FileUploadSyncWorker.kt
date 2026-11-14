package com.nkb.cloud.sync

import android.content.Context
import android.net.Uri
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.nkb.cloud.security.KeystoreManager
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

/**
 * FileUploadSyncWorker: WorkManager background worker for uploading files & photos
 * Executes under OS constraints: Unmetered network, battery not low, automatic retries.
 */
class FileUploadSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val filePath = inputData.getString("FILE_PATH") ?: return Result.failure()
        val serverUrl = inputData.getString("SERVER_URL") ?: return Result.failure()
        val folderId = inputData.getString("FOLDER_ID")

        val keystoreManager = KeystoreManager(applicationContext)
        val token = keystoreManager.getAuthToken() ?: return Result.failure()

        val file = File(filePath)
        if (!file.exists()) return Result.failure()

        return try {
            val client = OkHttpClient()
            val fileBody = file.asRequestBody("application/octet-stream".toMediaTypeOrNull())
            val multipartBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, fileBody)
                .apply {
                    if (!folderId.isNullOrEmpty()) {
                        addFormDataPart("folderId", folderId)
                    }
                }
                .build()

            val request = Request.Builder()
                .url("$serverUrl/api/files/upload/direct")
                .header("Authorization", "Bearer $token")
                .post(multipartBody)
                .build()

            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                Result.success()
            } else if (response.code in 500..599) {
                Result.retry()
            } else {
                Result.failure()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
