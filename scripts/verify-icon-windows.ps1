$exePath = 'release\Kindred Setup 0.1.0.exe'
if (-not (Test-Path $exePath)) { Write-Error "File not found: $exePath"; exit 1 }
$fileInfo = Get-Item $exePath | Select-Object Name, Length, LastWriteTime
Write-Host "Installer: $($fileInfo.Name) ($($fileInfo.Length) bytes)"

# Quick PE check for resource section
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$rsrcFound = $false
for ($i = 0; $i -lt $bytes.Length - 10; $i++) {
  if ($bytes[$i] -eq 0x2e -and $bytes[$i+1] -eq 0x72 -and $bytes[$i+2] -eq 0x73 -and $bytes[$i+3] -eq 0x72 -and $bytes[$i+4] -eq 0x63) {
    $rsrcFound = $true
    Write-Host "PE .rsrc section found at offset: $([System.Convert]::ToString($i, 16))"
    break
  }
}
if ($rsrcFound) {
  Write-Host "PASS: Executable has resource section (icon)"
} else {
  Write-Host "WARN: No .rsrc section found"
}

# Check unpacked app icon
$appExePath = 'release\win-unpacked\Kindred.exe'
if (Test-Path $appExePath) {
  $appBytes = [System.IO.File]::ReadAllBytes($appExePath)
  $appRsrcFound = $false
  for ($i = 0; $i -lt $appBytes.Length - 10; $i++) {
    if ($appBytes[$i] -eq 0x2e -and $appBytes[$i+1] -eq 0x72 -and $appBytes[$i+2] -eq 0x73 -and $appBytes[$i+3] -eq 0x72 -and $appBytes[$i+4] -eq 0x63) {
      $appRsrcFound = $true
      Write-Host "PASS: Unpacked app has .rsrc section (icon)"
      break
    }
  }
  if (-not $appRsrcFound) {
    Write-Host "WARN: Unpacked app has no .rsrc section"
  }
}
