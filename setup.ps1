# HighBridge — Windows Auto-Setup
# Run this once: right-click → "Run with PowerShell"

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  HighBridge — GoHighLevel MCP Installer  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: npm install
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $dir
npm install --silent
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# Step 2: Collect credentials
Write-Host "Enter your GHL credentials." -ForegroundColor Yellow
Write-Host "(Find them in GHL → Settings → Integrations → API Keys)" -ForegroundColor Gray
Write-Host ""
$apiKey = Read-Host "GHL Private Integration Token (starts with pit-)"
$locationId = Read-Host "GHL Location ID"

if (-not $apiKey.StartsWith("pit-")) {
    Write-Host "Warning: token should start with 'pit-'. Double-check in GHL." -ForegroundColor Red
}

# Step 3: Write .env
$envContent = "GHL_API_KEY=$apiKey`nGHL_LOCATION_ID=$locationId"
Set-Content -Path "$dir\.env" -Value $envContent
Write-Host ".env saved." -ForegroundColor Green
Write-Host ""

# Step 4: Patch claude_desktop_config.json
$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
$indexPath = $dir + "\src\index.js"
$indexPath = $indexPath -replace "\\", "\\"

$newEntry = @"
    "highbridge": {
      "command": "node",
      "args": ["$indexPath"],
      "env": {
        "GHL_API_KEY": "$apiKey",
        "GHL_LOCATION_ID": "$locationId"
      }
    }
"@

if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    New-Item -ItemType Directory -Force -Path (Split-Path $configPath) | Out-Null
    $config = [PSCustomObject]@{ mcpServers = [PSCustomObject]@{} }
}

if (-not $config.mcpServers) {
    $config | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
}

$serverConfig = [PSCustomObject]@{
    command = "node"
    args    = @("$($dir -replace '\\','\\')\\src\\index.js")
    env     = [PSCustomObject]@{
        GHL_API_KEY     = $apiKey
        GHL_LOCATION_ID = $locationId
    }
}

$config.mcpServers | Add-Member -MemberType NoteProperty -Name "highbridge" -Value $serverConfig -Force
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath
Write-Host "Claude Desktop config updated." -ForegroundColor Green
Write-Host ""

# Step 5: Verify
Write-Host "Running live connection test..." -ForegroundColor Yellow
node "$dir\src\index.js" --test
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  Restart Claude Desktop to activate." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
