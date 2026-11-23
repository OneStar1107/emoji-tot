param(
  [string]$Subject = 'CN=OneStar1107, O=EmojiTot, C=CN'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$currentUser = [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
$personal = New-Object System.Security.Cryptography.X509Certificates.X509Store('My', $currentUser)
$trustedRoot = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $currentUser)
$personal.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
$trustedRoot.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)

$certificate = $personal.Certificates |
  Where-Object {
    $_.Subject -eq $Subject -and
    $_.HasPrivateKey -and
    $_.NotAfter -gt (Get-Date)
  } |
  Sort-Object NotAfter -Descending |
  Select-Object -First 1

if (-not $certificate -or $certificate.NotAfter -le (Get-Date) -or -not $certificate.HasPrivateKey) {
  Import-Module PKI -ErrorAction Stop
  $certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -FriendlyName 'EmojiTot local code signing' `
    -CertStoreLocation Cert:\CurrentUser\My `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3)
}

$trusted = $trustedRoot.Certificates |
  Where-Object Thumbprint -eq $certificate.Thumbprint
if (-not $trusted) {
  $trustedRoot.Add($certificate)
}

$randomBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($randomBytes)
} finally {
  $random.Dispose()
}
$password = [Convert]::ToBase64String($randomBytes)
$pfx = Join-Path $env:TEMP ('emojitot-selfsigned-' + [guid]::NewGuid() + '.pfx')

try {
  $pfxBytes = $certificate.Export(
    [System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx,
    $password
  )
  [System.IO.File]::WriteAllBytes($pfx, $pfxBytes)
  $env:CSC_LINK = $pfx
  $env:CSC_KEY_PASSWORD = $password
  Push-Location $root
  try {
    & pnpm dist
    if ($LASTEXITCODE -ne 0) {
      throw 'Signed packaging failed with exit code ' + $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }

  $files = @(
    (Join-Path $root 'release\win-unpacked\EmojiTot.exe'),
    (Join-Path $root 'release\EmojiTot.Setup.exe'),
    (Join-Path $root 'release\EmojiTot.Portable.exe')
  )
  $invalid = @(
    Get-AuthenticodeSignature -LiteralPath $files |
      Where-Object Status -ne 'Valid'
  )
  if ($invalid.Count -gt 0) {
    throw 'Signature verification failed: ' +
      (($invalid | ForEach-Object { $_.Path + '=' + $_.Status }) -join ', ')
  }

  Write-Host ('Self-signed EmojiTot with ' + $certificate.Subject)
  Write-Host ('Certificate thumbprint: ' + $certificate.Thumbprint)
  $files | ForEach-Object {
    $signature = Get-AuthenticodeSignature -LiteralPath $_
    Write-Host ($signature.Status + '  ' + $_)
  }
} finally {
  Remove-Item Env:CSC_LINK -ErrorAction SilentlyContinue
  Remove-Item Env:CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  $pfxBytes = $null
  if (Test-Path -LiteralPath $pfx) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
      $pfx,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
  }
  $personal.Close()
  $trustedRoot.Close()
}
