# =====================================================================
#  Creation de l'archive ZIP publique - Evaluation PE et PO
#  Appele par creer-archive-publique.bat
#  - Exclut les dossiers et fichiers prives ou regeneres
#  - Reinitialise les donnees (historique, classes, entrees, sorties)
#  - Ecrit le ZIP avec des separateurs "/" (norme ZIP, compatible macOS/Linux)
# =====================================================================
$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$zipName  = 'Evaluation-PE-et-PO-Public.zip'
$dest     = Join-Path $root $zipName
$tempDir  = Join-Path $env:TEMP ('eval_pkg_' + [System.Guid]::NewGuid().ToString('N'))

$excludeDirs  = @('node_modules', '.next', '.git', '.agents', 'dist', 'out')
$excludeFiles = @('.env.local', $zipName, 'journal_installation.txt', 'journal_compilation.txt', 'lancement_en_cours.lock')
$unixExecExtensions = @('.command', '.sh')

# ---------------------------------------------------------------------
#  Les outils ZIP de Windows n'enregistrent pas les droits Unix : une fois
#  decompresses sur Mac, les fichiers .command ne seraient pas executables
#  ("vous n'avez pas l'autorisation necessaire"). On reecrit donc, dans le
#  repertoire central du ZIP, le systeme d'origine (Unix) et les droits de
#  chaque entree : 755 pour les dossiers et les lanceurs, 644 pour le reste.
#  Les attributs Windows (octet de poids faible) sont conserves.
# ---------------------------------------------------------------------
function Set-ZipUnixPermissions {
    param([Parameter(Mandatory)] [string] $Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)

    # Fin du repertoire central (signature 0x06054b50), cherchee depuis la fin
    $eocd = -1
    for ($i = $bytes.Length - 22; $i -ge [Math]::Max(0, $bytes.Length - 22 - 65535); $i--) {
        if ([BitConverter]::ToUInt32($bytes, $i) -eq 0x06054b50) { $eocd = $i; break }
    }
    if ($eocd -lt 0) { throw 'Structure ZIP invalide : fin du repertoire central introuvable.' }

    $entryCount = [BitConverter]::ToUInt16($bytes, $eocd + 10)
    $pos        = [int64][BitConverter]::ToUInt32($bytes, $eocd + 16)
    if ($entryCount -eq 0xFFFF -or $pos -eq 0xFFFFFFFF) { throw 'Archive ZIP64 non prise en charge.' }

    for ($n = 0; $n -lt $entryCount; $n++) {
        if ([BitConverter]::ToUInt32($bytes, $pos) -ne 0x02014b50) {
            throw "Structure ZIP invalide a l'entree $n."
        }
        $nameLen    = [BitConverter]::ToUInt16($bytes, $pos + 28)
        $extraLen   = [BitConverter]::ToUInt16($bytes, $pos + 30)
        $commentLen = [BitConverter]::ToUInt16($bytes, $pos + 32)
        $name       = [System.Text.Encoding]::UTF8.GetString($bytes, $pos + 46, $nameLen)
        $dosAttr    = [BitConverter]::ToUInt32($bytes, $pos + 38) -band 0xFF

        if ($name.EndsWith('/')) {
            $mode = 0x41ED                                  # dossier, rwxr-xr-x (040755)
            $dosAttr = $dosAttr -bor 0x10
        }
        elseif ($unixExecExtensions -contains [System.IO.Path]::GetExtension($name).ToLowerInvariant()) {
            $mode = 0x81ED                                  # fichier, rwxr-xr-x (0100755)
        }
        else {
            $mode = 0x81A4                                  # fichier, rw-r--r-- (0100644)
        }

        $bytes[$pos + 5] = 3                                # "version made by" : systeme Unix
        $attr = [BitConverter]::GetBytes([uint32](([int64]$mode -shl 16) -bor $dosAttr))
        [Array]::Copy($attr, 0, $bytes, $pos + 38, 4)

        $pos += 46 + $nameLen + $extraLen + $commentLen
    }

    [System.IO.File]::WriteAllBytes($Path, $bytes)
}

try {
    Write-Host "Dossier de l'application : $root"
    Write-Host ''
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    Write-Host '[1/5] Copie des fichiers sources...' -ForegroundColor Cyan
    Get-ChildItem -LiteralPath $root -Force | Where-Object {
        if ($_.PSIsContainer) { -not ($excludeDirs -contains $_.Name) }
        else { -not ($excludeFiles -contains $_.Name) }
    } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $tempDir -Recurse -Force
    }

    Write-Host '[2/5] Nettoyage des donnees personnelles et historiques...' -ForegroundColor Cyan
    $dataDir = Join-Path $tempDir 'data'
    if (Test-Path -LiteralPath $dataDir) {
        Set-Content -LiteralPath (Join-Path $dataDir 'history.json') -Value '[]' -Encoding ASCII
        Set-Content -LiteralPath (Join-Path $dataDir 'classes.json') -Value '[]' -Encoding ASCII
        foreach ($sub in @('inputs', 'outputs', 'evaluations', 'pending')) {
            $p = Join-Path $dataDir $sub
            if (Test-Path -LiteralPath $p) {
                Get-ChildItem -LiteralPath $p -Force | Remove-Item -Recurse -Force
            }
        }
    }

    Write-Host '[3/5] Compression en archive ZIP...' -ForegroundColor Cyan
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $base = $tempDir.TrimEnd('\') + '\'
    $zip = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $count = 0
        foreach ($file in [System.IO.Directory]::EnumerateFiles($tempDir, '*', [System.IO.SearchOption]::AllDirectories)) {
            $entryName = $file.Substring($base.Length).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
            $count++
        }
        # Conserver les dossiers vides (data\inputs, data\outputs, etc.)
        foreach ($dir in [System.IO.Directory]::EnumerateDirectories($tempDir, '*', [System.IO.SearchOption]::AllDirectories)) {
            if (-not [System.IO.Directory]::EnumerateFileSystemEntries($dir).GetEnumerator().MoveNext()) {
                $zip.CreateEntry($dir.Substring($base.Length).Replace('\', '/') + '/') | Out-Null
            }
        }
    }
    finally {
        $zip.Dispose()
    }

    Write-Host '[4/5] Ajout des droits macOS/Linux (lanceurs .command executables)...' -ForegroundColor Cyan
    Set-ZipUnixPermissions -Path $dest

    Write-Host '[5/5] Nettoyage du dossier temporaire...' -ForegroundColor Cyan
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue

    $sizeMB = [Math]::Round(((Get-Item -LiteralPath $dest).Length / 1MB), 2)
    Write-Host ''
    Write-Host "[SUCCES] Archive creee : $dest" -ForegroundColor Green
    Write-Host "         $count fichiers, $sizeMB Mo" -ForegroundColor Green
    Start-Process explorer.exe -ArgumentList "/select,`"$dest`""
    exit 0
}
catch {
    Write-Host ''
    Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path -LiteralPath $tempDir) { Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}
