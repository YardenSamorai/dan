# Builds the site and publishes it to Cloudflare Pages (https://ten-atelier.pages.dev).
# Usage, from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\deploy-pages.ps1
# Add -Secrets the first time (or after changing keys) to copy the Supabase keys from .env.local to Cloudflare.
param([switch]$Secrets)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$project = 'ten-atelier'

if ($Secrets) {
  $kv = @{}
  Get-Content .env.local | Where-Object { $_ -match '^([A-Z_]+)=(.+)$' } | ForEach-Object { $kv[$matches[1]] = $matches[2].Trim() }
  foreach ($k in 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY') {
    if (-not $kv[$k]) { throw "$k is missing in .env.local" }
  }
  $file = Join-Path $env:TEMP "pages-secrets-$([guid]::NewGuid()).json"
  @{ SUPABASE_URL = $kv.VITE_SUPABASE_URL; SUPABASE_PUBLISHABLE_KEY = $kv.VITE_SUPABASE_PUBLISHABLE_KEY; SUPABASE_SECRET_KEY = $kv.SUPABASE_SECRET_KEY } |
    ConvertTo-Json | Set-Content $file -Encoding utf8
  try { npx wrangler pages secret bulk $file --project-name $project } finally { Remove-Item $file -Force }
}

npm run build
if ($LASTEXITCODE) { throw 'Build failed' }
npx wrangler pages deploy dist --project-name $project --branch main --commit-dirty=true
