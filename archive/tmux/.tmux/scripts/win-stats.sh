#!/bin/bash
# Fetches Windows CPU & RAM stats via PowerShell and caches them.
# Cache TTL: 10 seconds. Output: two lines — RAM then CPU.

CACHE_FILE="/tmp/tmux-win-stats"
TTL=5

if [ -f "$CACHE_FILE" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$CACHE_FILE") ))
  if [ "$age" -lt "$TTL" ]; then
    cat "$CACHE_FILE"
    exit 0
  fi
fi

PS="/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"

output=$("$PS" -NoProfile -Command '
$os = Get-CimInstance Win32_OperatingSystem
$ram = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/1MB,1).ToString() + "GB/" + [math]::Round($os.TotalVisibleMemorySize/1MB,0).ToString() + "GB"
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average.ToString() + "%"
Write-Output $ram
Write-Output $cpu
' 2>/dev/null | tr -d '\r')

if [ -n "$output" ]; then
  echo "$output" > "$CACHE_FILE"
  echo "$output"
fi
