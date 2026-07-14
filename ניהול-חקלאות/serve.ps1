# serve.ps1 - simple static file server for local testing only (ASCII-safe)
param([int]$Port = 8777, [string]$Root = '')

if ([string]::IsNullOrEmpty($Root)) {
  $base = $PSScriptRoot
  if ([string]::IsNullOrEmpty($base)) { $base = (Get-Location).Path }
  # find the subfolder that contains index.html (avoids hardcoding a non-ASCII name)
  $cand = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
          Where-Object { Test-Path (Join-Path $_.FullName 'index.html') } |
          Select-Object -First 1
  if ($cand) { $Root = $cand.FullName }
  elseif (Test-Path (Join-Path $base 'index.html')) { $Root = $base }
  else { $Root = $base }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $Root on http://localhost:$Port/"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.js'='application/javascript; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml';
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($rel)) { $rel = 'index.html' }
    $path = Join-Path $Root $rel
    $ctx.Response.Headers.Add('Cache-Control', 'no-store, no-cache, must-revalidate')
    $ctx.Response.Headers.Add('Pragma', 'no-cache')

    # שמירה אוטומטית: POST /save כותב את הנתונים ל-data.json בתיקיית OneDrive
    if ($ctx.Request.HttpMethod -eq 'POST' -and $rel -eq 'save') {
      try {
        $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $savePath = Join-Path $Root 'data.json'
        $enc = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($savePath, $body, $enc)
        $ctx.Response.StatusCode = 200
        $ok = [System.Text.Encoding]::UTF8.GetBytes('ok')
        $ctx.Response.OutputStream.Write($ok, 0, $ok.Length)
      } catch {
        $ctx.Response.StatusCode = 500
      }
      $ctx.Response.Close()
      continue
    }

    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [System.Text.Encoding]::UTF8.GetBytes('404 not found')
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
    $ctx.Response.Close()
  } catch { }
}
