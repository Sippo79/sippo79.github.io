# Sippo mascot background remover.
# Flood-fills from image borders to make white / checkerboard backgrounds
# transparent. The character is enclosed by dark outlines, so white fur,
# the sleepy "Z" marks and the surprise ticks are preserved.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SippoBgRemover
{
    // Background = bright, low-saturation pixel (white or light checker gray).
    static bool IsBg(byte r, byte g, byte b)
    {
        int max = Math.Max(r, Math.Max(g, b));
        int min = Math.Min(r, Math.Min(g, b));
        return min >= 188 && (max - min) <= 34;
    }

    public static string Process(string srcPath, string dstPath)
    {
        using (var src = new Bitmap(srcPath))
        using (var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
        {
            using (var gfx = Graphics.FromImage(bmp))
                gfx.DrawImage(src, 0, 0, src.Width, src.Height);

            int w = bmp.Width, h = bmp.Height;
            var rect = new Rectangle(0, 0, w, h);
            var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int stride = data.Stride;
            var px = new byte[stride * h];
            Marshal.Copy(data.Scan0, px, 0, px.Length);

            var visited = new bool[w * h];
            var queue = new Queue<int>();

            Action<int, int> tryEnqueue = delegate(int x, int y)
            {
                int idx = y * w + x;
                if (visited[idx]) return;
                int o = y * stride + x * 4;
                if (IsBg(px[o + 2], px[o + 1], px[o]))
                {
                    visited[idx] = true;
                    queue.Enqueue(idx);
                }
            };

            for (int x = 0; x < w; x++) { tryEnqueue(x, 0); tryEnqueue(x, h - 1); }
            for (int y = 0; y < h; y++) { tryEnqueue(0, y); tryEnqueue(w - 1, y); }

            int removed = 0;
            while (queue.Count > 0)
            {
                int idx = queue.Dequeue();
                int cx = idx % w, cy = idx / w;
                px[cy * stride + cx * 4 + 3] = 0;
                removed++;
                if (cx > 0) tryEnqueue(cx - 1, cy);
                if (cx < w - 1) tryEnqueue(cx + 1, cy);
                if (cy > 0) tryEnqueue(cx, cy - 1);
                if (cy < h - 1) tryEnqueue(cx, cy + 1);
            }

            // Soften anti-aliased edges: bright low-saturation pixels that touch
            // the removed background become semi-transparent to avoid halos.
            var alpha0 = new bool[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    alpha0[y * w + x] = px[y * stride + x * 4 + 3] == 0;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w; x++)
                {
                    int idx = y * w + x;
                    if (alpha0[idx]) continue;
                    bool nearBg =
                        (x > 0 && alpha0[idx - 1]) || (x < w - 1 && alpha0[idx + 1]) ||
                        (y > 0 && alpha0[idx - w]) || (y < h - 1 && alpha0[idx + w]);
                    if (!nearBg) continue;
                    int o = y * stride + x * 4;
                    byte b = px[o], g = px[o + 1], r = px[o + 2];
                    int max = Math.Max(r, Math.Max(g, b));
                    int min = Math.Min(r, Math.Min(g, b));
                    if (min >= 170 && (max - min) <= 40)
                        px[o + 3] = 120;
                }
            }

            Marshal.Copy(px, 0, data.Scan0, px.Length);
            bmp.UnlockBits(data);
            bmp.Save(dstPath, ImageFormat.Png);
            return string.Format("{0}x{1} removed={2} ({3:P0})", w, h, removed, (double)removed / (w * h));
        }
    }
}
"@

$dir = Join-Path $PSScriptRoot "..\assets\sippo"
foreach ($f in Get-ChildItem (Join-Path $dir "_originals\*.webp")) {
    $dst = Join-Path $dir $f.Name
    $tmp = "$dst.tmp.png"
    $info = [SippoBgRemover]::Process($f.FullName, $tmp)
    Move-Item -Force $tmp $dst
    $size = [math]::Round((Get-Item $dst).Length / 1KB)
    Write-Output "$($f.Name): $info -> ${size}KB"
}
