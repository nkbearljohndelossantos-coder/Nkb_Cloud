package com.nkb.cloud.data.api

import com.nkb.cloud.data.model.*
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

/**
 * NkbCloudApi: Retrofit REST Interface for NKB Cloud Enterprise Storage Server
 */
interface NkbCloudApi {

    @POST("/api/auth/login")
    suspend fun login(@Body req: LoginRequest): Response<LoginResponse>

    @GET("/api/auth/me")
    suspend fun getCurrentUser(@Header("Authorization") authHeader: String): Response<User>

    @GET("/api/files")
    suspend fun getExplorerItems(
        @Header("Authorization") authHeader: String,
        @Query("folderId") folderId: String? = null,
        @Query("search") search: String? = null
    ): Response<ExplorerResponse>

    @GET("/api/files/{id}/download")
    @Streaming
    suspend fun downloadFile(
        @Header("Authorization") authHeader: String,
        @Path("id") fileId: String
    ): Response<ResponseBody>

    @GET("/api/files/{id}/preview")
    @Streaming
    suspend fun previewFile(
        @Header("Authorization") authHeader: String,
        @Path("id") fileId: String,
        @Query("inline") inline: String = "true"
    ): Response<ResponseBody>

    @Multipart
    @POST("/api/files/upload/direct")
    suspend fun directUpload(
        @Header("Authorization") authHeader: String,
        @Part file: MultipartBody.Part,
        @Part("folderId") folderId: String? = null
    ): Response<FileItem>

    // Device Enrollment & Status
    @POST("/api/devices/enroll")
    suspend fun enrollDevice(@Body req: EnrollmentRequest): Response<EnrollmentResponse>

    @GET("/api/devices/my-device")
    suspend fun getMyDevice(@Header("Authorization") authHeader: String): Response<DeviceStatusResponse>
}
