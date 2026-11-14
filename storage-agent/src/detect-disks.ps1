# NKB Cloud v2.1.0 - Read-Only Real Physical Storage Hardware Enumerator
# Strict Safety: READ-ONLY. No modifications, no formatting, no writes.
[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'

try {
    # 1. Query physical disks via Get-Disk
    $rawDisks = Get-Disk -ErrorAction SilentlyContinue
    # 2. Query physical disk storage metadata via Get-PhysicalDisk
    $rawPhys = Get-PhysicalDisk -ErrorAction SilentlyContinue
    # 3. Query WMI disk drives for interface and media type details
    $rawWmi = Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction SilentlyContinue
    # 4. Query all partitions
    $rawPartitions = Get-Partition -ErrorAction SilentlyContinue
    # 5. Query all volumes
    $rawVolumes = Get-Volume -ErrorAction SilentlyContinue

    $devices = @()
    $volumes = @()

    foreach ($disk in $rawDisks) {
        $diskNum = [int]$disk.Number
        $phys = $rawPhys | Where-Object { $_.DeviceId -eq [string]$diskNum } | Select-Object -First 1
        $wmi = $rawWmi | Where-Object { $_.Index -eq $diskNum } | Select-Object -First 1

        # Bus type determination
        $bus = 'UNKNOWN'
        if ($disk.BusType -and [string]$disk.BusType -ne 'Unknown') {
            $bus = [string]$disk.BusType
        } elseif ($phys.BusType -and [string]$phys.BusType -ne 'Unknown') {
            $bus = [string]$phys.BusType
        } elseif ($wmi.InterfaceType) {
            $bus = [string]$wmi.InterfaceType
        }

        # Media type determination (SSD, HDD, SCM)
        $media = 'UNKNOWN'
        if ($phys.MediaType -and [string]$phys.MediaType -ne 'Unspecified') {
            $media = [string]$phys.MediaType
        } elseif ($disk.MediaType -and [string]$disk.MediaType -ne 'Unspecified') {
            $media = [string]$disk.MediaType
        } else {
            $combinedName = "$($disk.FriendlyName) $($wmi.Model)"
            if ($combinedName -match 'SSD|NVMe|NVM') {
                $media = 'SSD'
            } elseif ($combinedName -match 'HDD|Hard Drive|ST1000|WD|BarraCuda') {
                $media = 'HDD'
            }
        }

        # Removable / Fixed determination
        $isUsb = ($bus -eq 'USB' -or [string]$disk.BusType -eq 'USB')
        $isExternalMedia = ($wmi.MediaType -match 'External' -or $wmi.MediaType -match 'Removable')
        $isRemovable = ($isUsb -or $isExternalMedia)

        # Connection type description
        $connType = if ($isRemovable) { "External $bus" } else { "Internal $bus" }
        $classification = if ($isRemovable) { 'Removable/External' } else { 'Fixed' }

        # Serial number
        $serial = 'UNKNOWN'
        if ($disk.SerialNumber -and $disk.SerialNumber.Trim() -ne '') {
            $serial = $disk.SerialNumber.Trim()
        } elseif ($phys.SerialNumber -and $phys.SerialNumber.Trim() -ne '') {
            $serial = $phys.SerialNumber.Trim()
        } elseif ($wmi.SerialNumber -and $wmi.SerialNumber.Trim() -ne '') {
            $serial = $wmi.SerialNumber.Trim()
        }

        # Unique ID
        $uniqueId = 'UNKNOWN'
        if ($disk.UniqueId -and $disk.UniqueId.Trim() -ne '') {
            $uniqueId = $disk.UniqueId.Trim()
        } elseif ($wmi.DeviceID) {
            $uniqueId = $wmi.DeviceID
        }

        # Vendor and Model
        $model = if ($disk.FriendlyName) { $disk.FriendlyName.Trim() } elseif ($wmi.Model) { $wmi.Model.Trim() } else { "Physical Disk $diskNum" }
        $vendor = 'UNKNOWN'
        if ($model -match '^(ST[0-9]|Seagate)') { $vendor = 'Seagate' }
        elseif ($model -match '^(WD|Western Digital)') { $vendor = 'Western Digital' }
        elseif ($model -match '^(Samsung)') { $vendor = 'Samsung' }
        elseif ($model -match '^(Kingston)') { $vendor = 'Kingston' }
        elseif ($model -match '^(KIOXIA|Toshiba)') { $vendor = 'Kioxia / Toshiba' }
        elseif ($model -match '^(GeIL)') { $vendor = 'GeIL' }
        elseif ($model -match '^(ASMT|ASMedia)') { $vendor = 'ASMedia' }
        elseif ($model -match '^(Crucial|Micron)') { $vendor = 'Crucial' }
        elseif ($model -match '^(SanDisk)') { $vendor = 'SanDisk' }
        else {
            $parts = $model -split ' '
            if ($parts.Count -gt 0 -and $parts[0].Length -gt 1) { $vendor = $parts[0] }
        }

        $partCount = if ($disk.NumberOfPartitions) { [int]$disk.NumberOfPartitions } elseif ($wmi.Partitions) { [int]$wmi.Partitions } else { 0 }

        $devices += [PSCustomObject]@{
            diskNumber = $diskNum
            deviceIndex = $diskNum
            vendor = $vendor
            model = $model
            hardwareSerial = $serial
            diskUniqueId = $uniqueId
            busType = $bus
            mediaType = $media
            totalCapacityBytes = [int64]$disk.Size
            operationalStatus = if ($disk.OperationalStatus) { [string]$disk.OperationalStatus } else { 'UNKNOWN' }
            healthStatus = if ($disk.HealthStatus) { [string]$disk.HealthStatus } elseif ($phys.HealthStatus) { [string]$phys.HealthStatus } else { 'UNKNOWN' }
            partitionCount = $partCount
            connectionType = $connType
            classification = $classification
            partitionStyle = if ($disk.PartitionStyle) { [string]$disk.PartitionStyle } else { 'UNKNOWN' }
        }

        # Query partitions associated with this disk
        $diskParts = $rawPartitions | Where-Object { [int]$_.DiskNumber -eq $diskNum }
        foreach ($part in $diskParts) {
            $partNum = [int]$part.PartitionNumber
            $driveLetterChar = [string]$part.DriveLetter
            $hasLetter = ($driveLetterChar -and $driveLetterChar -ne "`0" -and $driveLetterChar -ne '0')
            $driveLetter = if ($hasLetter) { "$($driveLetterChar):" } else { $null }

            # Strictly skip hidden, system, reserved, recovery, or non-data partitions
            $isHidden = ($part.IsHidden -eq $true -or $part.IsSystem -eq $true -or $part.Type -in @('System', 'Reserved', 'Recovery', 'Unknown'))
            if ($isHidden -or (-not $hasLetter)) {
                continue
            }

            # Associate volume
            $vol = $null
            if ($hasLetter) {
                $vol = $rawVolumes | Where-Object { [string]$_.DriveLetter -eq $driveLetterChar } | Select-Object -First 1
            }
            if (-not $vol -and $part.Guid) {
                $partGuidClean = $part.Guid.Trim('{}').ToLower()
                $vol = $rawVolumes | Where-Object { $_.UniqueId -and $_.UniqueId.ToLower().Contains($partGuidClean) } | Select-Object -First 1
            }

            $volGuid = 'NOT_AVAILABLE'
            if ($vol -and $vol.UniqueId) {
                if ($vol.UniqueId -match '\{([a-fA-F0-9-]+)\}') {
                    $volGuid = $matches[1].ToLower()
                } else {
                    $volGuid = $vol.UniqueId
                }
            } elseif ($part.Guid) {
                $volGuid = $part.Guid.Trim('{}').ToLower()
            }

            $volTotal = if ($vol -and $vol.Size) { [int64]$vol.Size } else { [int64]$part.Size }
            $volFree = if ($vol -and $vol.SizeRemaining -ne $null) { [int64]$vol.SizeRemaining } else { 0 }
            $volUsed = [Math]::Max(0, [int64]($volTotal - $volFree))
            $fsLabel = if ($vol -and $vol.FileSystemLabel) { $vol.FileSystemLabel } else { '' }
            $fsType = if ($vol -and $vol.FileSystem) { $vol.FileSystem } else { if ($part.Type) { $part.Type } else { 'RAW' } }

            $volHealth = if ($vol -and $vol.HealthStatus) { [string]$vol.HealthStatus } else { 'Healthy' }
            $volOpStatus = if ($vol -and $vol.OperationalStatus) { [string]$vol.OperationalStatus } else { 'OK' }

            $mountPoint = if ($hasLetter) {
                "$($driveLetter)\"
            } elseif ($vol -and $vol.Path) {
                $vol.Path
            } else {
                "Partition-$diskNum-$partNum"
            }

            $volumes += [PSCustomObject]@{
                diskIndex = $diskNum
                diskNumber = $diskNum
                partitionNumber = $partNum
                partitionOffset = [int64]$part.Offset
                partitionSize = [int64]$part.Size
                partitionType = if ($part.Type) { [string]$part.Type } else { 'Basic' }
                driveLetter = $driveLetter
                volumeGuid = $volGuid
                volumeLabel = $fsLabel
                filesystem = $fsType
                totalBytes = $volTotal
                freeBytes = $volFree
                usedBytes = $volUsed
                healthStatus = $volHealth
                operationalStatus = $volOpStatus
                mountPoint = $mountPoint
                hardwareSerial = $serial
            }
        }
    }

    $result = [PSCustomObject]@{
        success = $true
        timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        devices = $devices
        volumes = $volumes
    }

    $result | ConvertTo-Json -Depth 5 -Compress
} catch {
    $errResult = [PSCustomObject]@{
        success = $false
        error = $_.Exception.Message
        devices = @()
        volumes = @()
    }
    $errResult | ConvertTo-Json -Compress
}
