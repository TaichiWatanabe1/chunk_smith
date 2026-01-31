param(
    [ValidateSet("dev","prod")][string]$Mode = "dev"
)

Push-Location -Path $PSScriptRoot

# Try activate venv if present
$venvActivate = Join-Path $PSScriptRoot ".venv\Scripts\Activate.ps1"
if (Test-Path $venvActivate) {
    . $venvActivate
}

if ($Mode -eq 'dev') {
    Write-Output "Starting development server on 0.0.0.0:8000 (reload)"
    uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
} else {
    Write-Output "Starting production server on 0.0.0.0:8000"
    uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
}

Pop-Location
