package com.nkb.cloud.data.model

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val token: String,
    val user: User
)

data class User(
    val id: String,
    val username: String,
    val email: String,
    @SerializedName("full_name") val fullName: String,
    val role: String,
    @SerializedName("department_id") val departmentId: Int?,
    @SerializedName("department_name") val departmentName: String?,
    @SerializedName("session_version") val sessionVersion: Int
)

data class ExplorerResponse(
    val folders: List<FolderItem>,
    val files: List<FileItem>,
    val breadcrumbs: List<Breadcrumb>
)

data class FolderItem(
    val id: String,
    val name: String,
    @SerializedName("parent_id") val parentId: String?,
    @SerializedName("is_shared_drive") val isSharedDrive: Boolean,
    @SerializedName("updated_at") val updatedAt: String
)

data class FileItem(
    val id: String,
    val name: String,
    @SerializedName("original_name") val originalName: String,
    @SerializedName("mime_type") val mimeType: String,
    @SerializedName("size_bytes") val sizeBytes: Long,
    val category: String,
    val status: String,
    @SerializedName("is_starred") val isStarred: Boolean,
    @SerializedName("updated_at") val updatedAt: String
)

data class Breadcrumb(
    val id: String?,
    val name: String
)

data class EnrollmentRequest(
    val enrollmentToken: String,
    val machineName: String,
    val osVersion: String,
    val publicKey: String,
    val agentVersion: String = "2.1.0",
    val hardwareFingerprint: String? = null
)

data class EnrollmentResponse(
    val success: Boolean,
    val agentId: String,
    val agentToken: String,
    val status: String,
    val message: String
)

data class DeviceStatusResponse(
    val state: String,
    val primaryDevice: DeviceDetail?,
    val devices: List<DeviceDetail>,
    val agentConnected: Boolean
)

data class DeviceDetail(
    val id: String,
    val agentName: String,
    val machineName: String,
    val osVersion: String,
    val status: String,
    val persistedStatus: String,
    val keyFingerprint: String?
)
