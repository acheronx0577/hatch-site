# PowerShell script to add animations to all broker pages

$pages = @(
  "CommissionPlans",
  "Analytics", 
  "Leads",
  "LeadRoutingDesk"
)

$brokerPath = "src\pages\broker"

foreach ($pageName in $pages) {
  $file = "$brokerPath\$pageName.tsx"
  
  Write-Host "Processing: $pageName.tsx" -ForegroundColor Cyan
  
  if (-not (Test-Path $file)) {
    Write-Host "  ✗ File not found" -ForegroundColor Red
    continue
  }
  
  $content = Get-Content $file -Raw
  
  # Check if already has motion
  if ($content -match "from 'framer-motion'") {
    Write-Host "  ✓ Already has framer-motion" -ForegroundColor Green
    continue
  }
  
  # Add imports after first import statement
  $importPattern = "(import .+ from ['\"].+['\"])"
  if ($content -match $importPattern) {
    $content = $content -replace "($importPattern)", "`$1`nimport { motion } from 'framer-motion'`nimport { usePageAnimations } from '@/hooks/usePageAnimations'"
    Write-Host "  ✓ Added imports" -ForegroundColor Green
  }
  
  # Save the file
  Set-Content -Path $file -Value $content -NoNewline
}

Write-Host "`nDone! Remember to:" -ForegroundColor Yellow
Write-Host "1. Add hook in each component function" -ForegroundColor Yellow  
Write-Host "2. Wrap header sections with motion.div" -ForegroundColor Yellow
Write-Host "3. Use pageVariants for animations" -ForegroundColor Yellow
