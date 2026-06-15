Add-Type -AssemblyName System.Drawing

$assetDir = Join-Path $PSScriptRoot '..\assets\mascot'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$W = 380
$H = 360

function New-Canvas {
  $bmp = New-Object System.Drawing.Bitmap $W, $H, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)
  return @{ Bitmap = $bmp; Graphics = $g }
}

function Brush($hex) {
  return New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($hex))
}

function Pen($hex, $width) {
  $p = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($hex), $width)
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $p
}

function Path {
  return New-Object System.Drawing.Drawing2D.GraphicsPath
}

function Save-Part($name, $canvas) {
  $path = Join-Path $assetDir $name
  $canvas.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Dispose()
}

function FillPath($g, $path, $fill, $stroke = $null) {
  $g.FillPath($fill, $path)
  if ($stroke -ne $null) { $g.DrawPath($stroke, $path) }
}

function CurveTo($path, $c1x, $c1y, $c2x, $c2y, $x, $y) {
  $last = $path.GetLastPoint()
  $path.AddBezier($last.X, $last.Y, $c1x, $c1y, $c2x, $c2y, $x, $y)
}

function DrawSoftCurve($g, $pen, $x1, $y1, $x2, $y2, $x3, $y3) {
  $path = Path
  $path.StartFigure()
  $path.AddBezier($x1, $y1, $x2, $y2, $x2, $y2, $x3, $y3)
  $g.DrawPath($pen, $path)
  $path.Dispose()
}

$black = Brush '#1A1D23'
$black2 = Brush '#252932'
$ink = Pen '#111318' 5
$inkThin = Pen '#111318' 3
$cream = Brush '#FFF8EA'
$white = Brush '#FFFDF7'
$pink = Brush '#F7C7BC'
$blushPen = Pen '#FF9AA5' 4

# tail
$c = New-Canvas
$g = $c.Graphics
$p = Path
$p.StartFigure()
$p.AddBezier(235,302,286,300,325,270,329,229)
CurveTo $p 333 198 309 186 289 202
CurveTo $p 272 216 288 226 304 224
CurveTo $p 323 224 322 257 293 278
CurveTo $p 275 291 254 292 235 290
$p.CloseFigure()
FillPath $g $p $black $ink
$tip = Path
$tip.StartFigure()
$tip.AddBezier(293,202,317,196,329,225,322,254)
$tip.AddBezier(312,238,301,225,282,222,284,211)
CurveTo $tip 286 207 289 204 293 202
$tip.CloseFigure()
FillPath $g $tip $cream $null
$g.DrawBezier((Pen '#FFFDF7' 4), 268,288,288,280,302,263,313,241)
Save-Part 'tail.png' $c

# body
$c = New-Canvas
$g = $c.Graphics
$body = Path
$body.StartFigure()
$body.AddBezier(105,320,98,268,128,234,184,210)
$body.AddBezier(240,234,270,268,263,320,247,338)
$body.AddLine(121,338)
CurveTo $body 114 336 108 331 105 320
$body.CloseFigure()
FillPath $g $body $black $ink
$chest = Path
$chest.StartFigure()
$chest.AddBezier(184,222,211,236,224,262,210,258)
CurveTo $chest 222 278 205 301 195 288
CurveTo $chest 192 313 184 324 184 324
CurveTo $chest 176 313 173 288 173 288
CurveTo $chest 163 301 146 278 158 258
CurveTo $chest 144 262 157 236 184 222
$chest.CloseFigure()
FillPath $g $chest $cream $inkThin
$legL = Path
$legL.StartFigure()
$legL.AddBezier(122,286,124,248,146,231,156,254)
$legL.AddBezier(158,278,151,302,134,307,124,300)
$legL.CloseFigure()
FillPath $g $legL $black2 $null
$legR = Path
$legR.StartFigure()
$legR.AddBezier(246,286,244,248,222,231,212,254)
$legR.AddBezier(210,278,217,302,234,307,244,300)
$legR.CloseFigure()
FillPath $g $legR $black2 $null
foreach ($paw in @(@(144,329), @(224,329))) {
  $g.FillEllipse($cream, $paw[0]-21, $paw[1]-16, 42, 32)
  $g.DrawEllipse($inkThin, $paw[0]-21, $paw[1]-16, 42, 32)
  $g.FillEllipse((Brush '#2A2527'), $paw[0]-8, $paw[1], 16, 12)
  $g.FillEllipse((Brush '#2A2527'), $paw[0]-13, $paw[1]-8, 7, 7)
  $g.FillEllipse((Brush '#2A2527'), $paw[0]-3.5, $paw[1]-12, 7, 7)
  $g.FillEllipse((Brush '#2A2527'), $paw[0]+6, $paw[1]-8, 7, 7)
}
Save-Part 'body.png' $c

# ears
function Draw-Ear($name, [bool]$left) {
  $c = New-Canvas
  $g = $c.Graphics
  $outer = Path
  $outer.StartFigure()
  if ($left) {
    $outer.AddBezier(111,126,65,72,50,22,64,9)
    $outer.AddBezier(86,4,134,26,160,76,136,91)
    CurveTo $outer 126 101 118 112 111 126
  } else {
    $outer.AddBezier(259,126,305,72,320,22,306,9)
    $outer.AddBezier(284,4,236,26,210,76,234,91)
    CurveTo $outer 244 101 252 112 259 126
  }
  $outer.CloseFigure()
  FillPath $g $outer $black $ink
  $inner = Path
  $inner.StartFigure()
  if ($left) {
    $inner.AddBezier(108,99,80,63,68,28,113,40)
    $inner.AddBezier(132,57,144,76,139,79,122,86)
    CurveTo $inner 116 90 112 94 108 99
  } else {
    $inner.AddBezier(262,99,290,63,302,28,257,40)
    $inner.AddBezier(238,57,226,76,231,79,248,86)
    CurveTo $inner 254 90 258 94 262 99
  }
  $inner.CloseFigure()
  FillPath $g $inner $cream $null
  if ($left) {
    $g.DrawBezier((Pen '#FFFDF7' 5), 94,113,80,89,72,65,70,48)
    $g.FillPolygon($pink, @([System.Drawing.Point]::new(88,43), [System.Drawing.Point]::new(126,79), [System.Drawing.Point]::new(107,88)))
  } else {
    $g.DrawBezier((Pen '#FFFDF7' 5), 276,113,290,89,298,65,300,48)
    $g.FillPolygon($pink, @([System.Drawing.Point]::new(282,43), [System.Drawing.Point]::new(244,79), [System.Drawing.Point]::new(263,88)))
  }
  Save-Part $name $c
}
Draw-Ear 'left-ear.png' $true
Draw-Ear 'right-ear.png' $false

# head without ears/eyes
$c = New-Canvas
$g = $c.Graphics
$head = Path
$head.StartFigure()
$head.AddBezier(185,60,229,60,257,95,275,161)
$head.AddBezier(271,204,241,231,185,257,129,231)
$head.AddBezier(99,204,95,161,113,95,141,60)
CurveTo $head 156 55 171 57 185 60
$head.CloseFigure()
FillPath $g $head $black $ink
$g.DrawLines((Pen '#111318' 8), @([System.Drawing.Point]::new(108,145), [System.Drawing.Point]::new(82,141), [System.Drawing.Point]::new(104,129), [System.Drawing.Point]::new(84,119), [System.Drawing.Point]::new(110,112)))
$g.DrawLines((Pen '#111318' 8), @([System.Drawing.Point]::new(262,145), [System.Drawing.Point]::new(288,141), [System.Drawing.Point]::new(266,129), [System.Drawing.Point]::new(286,119), [System.Drawing.Point]::new(260,112)))
$muzzle = Path
$muzzle.StartFigure()
$muzzle.AddBezier(122,160,142,140,176,146,185,143)
$muzzle.AddBezier(194,146,228,140,248,160,224,174)
$muzzle.AddBezier(231,192,212,207,185,217,158,207)
$muzzle.AddBezier(139,192,146,174,122,160,122,160)
$muzzle.CloseFigure()
FillPath $g $muzzle $cream $inkThin
$g.DrawBezier((Pen '#FFFDF7' 8), 126,164,114,181,113,199,138,196)
$g.DrawBezier((Pen '#FFFDF7' 8), 244,164,256,181,257,199,232,196)
$g.DrawLine((Pen '#111318' 4), 151,216,164,238)
$g.DrawLine((Pen '#111318' 4), 164,238,176,219)
$g.DrawLine((Pen '#111318' 4), 176,219,185,248)
$g.DrawLine((Pen '#111318' 4), 185,248,194,219)
$g.DrawLine((Pen '#111318' 4), 194,219,206,238)
$g.DrawLine((Pen '#111318' 4), 206,238,219,216)
$g.FillEllipse($cream, 128,96,28,28)
$g.DrawEllipse($inkThin, 128,96,28,28)
$g.FillEllipse($cream, 214,96,28,28)
$g.DrawEllipse($inkThin, 214,96,28,28)
$g.FillEllipse((Brush '#05070A'), 172,156,26,23)
$g.DrawLine((Pen '#05070A' 4), 185,181,185,188)
DrawSoftCurve $g (Pen '#05070A' 5) 185 188 174 201 159 190
DrawSoftCurve $g (Pen '#05070A' 5) 185 188 196 201 211 190
$tongue = Path
$tongue.StartFigure()
$tongue.AddBezier(173,194,185,190,197,194,195,209)
$tongue.AddBezier(192,218,178,218,175,209,173,194)
$tongue.CloseFigure()
FillPath $g $tongue (Brush '#F49AA1') (Pen '#D36A74' 3)
$g.DrawLine((Pen '#D97781' 2), 185,197,185,214)
DrawSoftCurve $g $blushPen 128 178 133 171 137 178
DrawSoftCurve $g $blushPen 140 180 145 173 149 180
DrawSoftCurve $g $blushPen 221 180 226 173 230 180
DrawSoftCurve $g $blushPen 233 178 238 171 242 178
Save-Part 'head.png' $c

# eyes
$c = New-Canvas
$g = $c.Graphics
foreach ($eye in @(@(143,137), @(227,137))) {
  $g.FillEllipse($white, $eye[0]-21, $eye[1]-21, 42, 42)
  $g.FillEllipse((Brush '#2B2020'), $eye[0]-18.5, $eye[1]-18.5, 37, 37)
  $g.FillEllipse((Brush '#05070A'), $eye[0]-12.8, $eye[1]-11.8, 25.6, 25.6)
  $g.FillEllipse($white, $eye[0]-6, $eye[1]-11, 10.6, 10.6)
  $g.FillEllipse($white, $eye[0]+7, $eye[1]+7, 5.4, 5.4)
}
Save-Part 'eyes.png' $c
