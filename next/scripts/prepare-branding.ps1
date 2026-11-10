param([Parameter(Mandatory = $true)][string]$SourceImage)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceFolder = Join-Path $projectRoot 'design/branding'
$assetFolder = Join-Path $projectRoot 'public/branding'
New-Item -ItemType Directory -Path $sourceFolder, $assetFolder -Force | Out-Null
$sourceCopy = Join-Path $sourceFolder 'warehouse-layout-source.png'
if ([IO.Path]::GetFullPath($SourceImage) -ne [IO.Path]::GetFullPath($sourceCopy)) {
    Copy-Item -LiteralPath $SourceImage -Destination $sourceCopy
}
$sourceBitmap = [Drawing.Image]::FromFile($sourceCopy)
try {
    foreach ($size in @(32, 64, 128, 180)) {
        $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($sourceBitmap, [Drawing.Rectangle]::new(0, 0, $size, $size))
            $bitmap.Save((Join-Path $assetFolder "warehouse-layout-$size.png"), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $sourceBitmap.Dispose() }
Get-ChildItem -LiteralPath $assetFolder | Select-Object Name, Length
