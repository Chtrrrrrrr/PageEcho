# PageEcho — generates the extension icon set.
# Usage:  powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'icons'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

function New-RoundedPath {
    param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-MasterIcon {
    param([int]$size)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Fully transparent background. Six wavefronts in two families of three:
    #   main wave      — travels right, its three arcs grow along the direction
    #                    of travel, so the leading (rightmost) one is the
    #                    biggest; drawn in the deepest colour.
    #   reflected wave — bounces back off the right and grows leftwards, its
    #                    three arcs stay smaller than the main wave and are
    #                    drawn lighter, like an echo that lost energy.
    $s = [float]$size
    $cy = $s * 0.5
    $theta = 48.0

    $mainPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 47, 127, 184), [float]($s * 0.062))
    $mainPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mainPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $echoPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 111, 176, 221), [float]($s * 0.052))
    $echoPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $echoPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    # 0 degrees points right and sweeps clockwise (y grows downwards).
    $mainCx = 0.33
    $echoCx = 0.55
    $main = @(0.25, 0.39, 0.53)   # trailing -> leading, grows to the right
    $echo = @(0.13, 0.26, 0.39)   # trailing -> leading, grows to the left

    foreach ($r in $main) {
        $rr = $s * $r
        $box = New-Object System.Drawing.RectangleF([float]($s * $mainCx - $rr), [float]($cy - $rr), [float]($rr * 2), [float]($rr * 2))
        $g.DrawArc($mainPen, $box, [float](-$theta), [float]($theta * 2))
    }
    foreach ($r in $echo) {
        $rr = $s * $r
        $box = New-Object System.Drawing.RectangleF([float]($s * $echoCx - $rr), [float]($cy - $rr), [float]($rr * 2), [float]($rr * 2))
        $g.DrawArc($echoPen, $box, [float](180 - $theta), [float]($theta * 2))
    }

    $g.Dispose()
    return $bmp
}

function Save-Scaled {
    param([System.Drawing.Bitmap]$source, [int]$size, [string]$path)
    $target = New-Object System.Drawing.Bitmap($size, $size)
    $target.SetResolution(96, 96)
    $tg = [System.Drawing.Graphics]::FromImage($target)
    $tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $tg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $tg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $tg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $tg.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
    $tg.Dispose()
    $target.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $target.Dispose()
}

$master = New-MasterIcon 512
foreach ($size in 16, 32, 48, 128) {
    $path = Join-Path $outDir ("icon{0}.png" -f $size)
    Save-Scaled $master $size $path
    Write-Output ("wrote {0}" -f $path)
}
$master.Dispose()
