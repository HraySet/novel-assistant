$conn = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($conn) {
    foreach ($c in $conn) {
        Stop-Process -Id $c.OwningProcess -Force
        Write-Host "Killed PID: $($c.OwningProcess)"
    }
} else {
    Write-Host "No process on port 5173"
}
