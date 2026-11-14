package com.nkb.cloud

import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.nkb.cloud.data.api.NkbCloudApi
import com.nkb.cloud.data.model.*
import com.nkb.cloud.security.BiometricAuthManager
import com.nkb.cloud.security.KeystoreManager
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : FragmentActivity() {

    private lateinit var keystoreManager: KeystoreManager
    private lateinit var biometricManager: BiometricAuthManager
    private lateinit var api: NkbCloudApi
    private var serverUrl = "https://cloud.nkb.local"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        keystoreManager = KeystoreManager(this)
        biometricManager = BiometricAuthManager(this)

        initRetrofit()

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    var token by remember { mutableStateOf(keystoreManager.getAuthToken()) }

                    if (token.isNullOrEmpty()) {
                        LoginScreen(
                            onLoginSuccess = { newToken ->
                                keystoreManager.saveAuthToken(newToken)
                                token = newToken
                            }
                        )
                    } else {
                        MainAppScreen(
                            token = token!!,
                            onLogout = {
                                keystoreManager.clearAll()
                                token = null
                            }
                        )
                    }
                }
            }
        }
    }

    private fun initRetrofit() {
        val retrofit = Retrofit.Builder()
            .baseUrl(serverUrl)
            .client(OkHttpClient.Builder().build())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
        api = retrofit.create(NkbCloudApi::class.java)
    }

    @Composable
    fun LoginScreen(onLoginSuccess: (String) -> Unit) {
        var username by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var loading by remember { mutableStateOf(false) }
        var errorMessage by remember { mutableStateOf<String?>(null) }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.Cloud,
                contentDescription = "NKB Cloud",
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "NKB Cloud Mobile",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Enterprise Zero-Trust Cloud Storage",
                fontSize = 12.sp,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(32.dp))

            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("Username") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    loading = true
                    errorMessage = null
                    lifecycleScope.launch {
                        try {
                            val resp = api.login(LoginRequest(username, password))
                            if (resp.isSuccessful && resp.body() != null) {
                                onLoginSuccess(resp.body()!!.token)
                            } else {
                                errorMessage = "Invalid username or password"
                            }
                        } catch (e: Exception) {
                            errorMessage = "Connection error: ${e.localizedMessage}"
                        } finally {
                            loading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !loading
            ) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White)
                } else {
                    Text("Sign In")
                }
            }

            if (biometricManager.isBiometricAvailable() && keystoreManager.getAuthToken() != null) {
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedButton(
                    onClick = {
                        biometricManager.promptBiometric(
                            this@MainActivity,
                            onSuccess = {
                                onLoginSuccess(keystoreManager.getAuthToken()!!)
                            },
                            onError = { err ->
                                Toast.makeText(this@MainActivity, err, Toast.LENGTH_SHORT).show()
                            }
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(imageVector = Icons.Default.Fingerprint, contentDescription = "Biometric")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Unlock with Biometrics")
                }
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(16.dp))
                Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            }
        }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun MainAppScreen(token: String, onLogout: () -> Unit) {
        var folders by remember { mutableStateOf<List<FolderItem>>(emptyList()) }
        var files by remember { mutableStateOf<List<FileItem>>(emptyList()) }
        var loading by remember { mutableStateOf(true) }
        var deviceState by remember { mutableStateOf("PENDING") }

        LaunchedEffect(Unit) {
            try {
                val resp = api.getExplorerItems("Bearer $token")
                if (resp.isSuccessful && resp.body() != null) {
                    folders = resp.body()!!.folders
                    files = resp.body()!!.files
                }
                val devResp = api.getMyDevice("Bearer $token")
                if (devResp.isSuccessful && devResp.body() != null) {
                    deviceState = devResp.body()!!.state
                }
            } catch (e: Exception) {
                // Ignore for offline simulation
            } finally {
                loading = false
            }
        }

        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("NKB Cloud Drive") },
                    actions = {
                        IconButton(onClick = onLogout) {
                            Icon(Icons.Default.ExitToApp, contentDescription = "Logout")
                        }
                    }
                )
            }
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                // Device Enrollment Status Banner
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (deviceState == "CONNECTED") Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (deviceState == "CONNECTED") Icons.Default.CheckCircle else Icons.Default.Shield,
                            contentDescription = "Status",
                            tint = if (deviceState == "CONNECTED") Color(0xFF2E7D32) else Color(0xFFE65100)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = "Device Status: $deviceState",
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                            Text(
                                text = "Hardware Keystore Protected",
                                fontSize = 11.sp,
                                color = Color.Gray
                            )
                        }
                    }
                }

                if (loading) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                } else {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        item {
                            Text(
                                text = "Folders",
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 16.dp, top = 8.dp)
                            )
                        }
                        items(folders) { folder ->
                            ListItem(
                                headlineContent = { Text(folder.name) },
                                leadingContent = { Icon(Icons.Default.Folder, contentDescription = null, tint = Color(0xFF1E3A8A)) },
                                modifier = Modifier.clickable { }
                            )
                        }

                        item {
                            Text(
                                text = "Files",
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(start = 16.dp, top = 16.dp)
                            )
                        }
                        items(files) { file ->
                            ListItem(
                                headlineContent = { Text(file.name) },
                                supportingContent = { Text("${file.sizeBytes / 1024} KB • ${file.mimeType}") },
                                leadingContent = { Icon(Icons.Default.InsertDriveFile, contentDescription = null) },
                                trailingContent = {
                                    IconButton(onClick = { /* Share dialog */ }) {
                                        Icon(Icons.Default.Share, contentDescription = "Share")
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
