<#
  Build and deploy SureDose to the test Worker, checking the push setup on the way.

    .\scripts\deploy-test.ps1 -PublicKey "<87-character Public Key>"

  The public key is not secret; it is built into the app. The private key and
  VAPID_SUBJECT are Worker secrets, set once with:
    npx wrangler secret put VAPID_PRIVATE_KEY --name suredose-test
    npx wrangler secret put VAPID_SUBJECT --name suredose-test    (mailto:you@example.com)
  Both must come from the SAME `npx web-push generate-vapid-keys` run as the public key.
#>
param(
  [Parameter(Mandatory = $true)][string]$PublicKey,
  [string]$Name = "suredose-test"
)

$ErrorActionPreference = "Stop"

# Tolerate the usual copy-paste wrappers: quotes, angle brackets, spaces.
$key = $PublicKey.Trim().Trim('"', "'", '<', '>', '`').Trim()
if ($key -notmatch '^[A-Za-z0-9_-]{87}$') {
  throw "The public key must be exactly 87 characters (letters, digits, - and _). Yours is $($key.Length). Copy only the key itself, not the 'Public Key:' label."
}
$env:VITE_VAPID_PUBLIC_KEY = $key

Write-Host "Version:" (git log --oneline -1)
npm run build
if ($LASTEXITCODE -ne 0) { throw "The build failed - nothing was deployed." }

npx wrangler deploy --config .output/server/wrangler.json --name $Name
if ($LASTEXITCODE -ne 0) { throw "The deploy failed." }

# Names only, never values.
$names = @()
try { $names = (npx wrangler secret list --name $Name | ConvertFrom-Json) | ForEach-Object { $_.name } } catch { }
foreach ($secret in "VAPID_PRIVATE_KEY", "VAPID_SUBJECT") {
  if ($names -notcontains $secret) {
    Write-Warning "Secret $secret is not set on $Name. Run: npx wrangler secret put $secret --name $Name"
  }
}

Write-Host ""
Write-Host "Deployed. On the caregiver phone: open the site, tap 'Turn on alerts', then 'Send a test alert'."
Write-Host "If the test alert fails, the message on the screen says exactly what to fix."
