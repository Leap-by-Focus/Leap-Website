$htmlDir = "c:\Users\shram\Documents\GitHub\Leap-Website\Leap-Website\html"

$ogTags = @"
    <meta name="description" content="Leap – Die Programmiersprache für Leichtigkeit und Fokus.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://deine-domain.at/">
    <meta property="og:title" content="Leap - Die einfache Programmiersprache">
    <meta property="og:description" content="Verstehe, was du tust. Mit klarer Syntax und integrierter KI-Unterstützung.">
    <meta property="og:image" content="https://deine-domain.at/assets/images/Leap-Preview.png">
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="Leap - Die einfache Programmiersprache">
    <meta property="twitter:image" content="https://deine-domain.at/assets/images/Leap-Preview.png">
"@

Get-ChildItem -Path $htmlDir -Filter "*.html" -Recurse | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw
    if ($content -notmatch 'og:title') {
        # Check if we can find <head>
        if ($content -match '(?i)<head>') {
            $newContent = $content -replace '(?i)<head>', "<head>`n$ogTags"
            Set-Content -Path $_.FullName -Value $newContent -NoNewline
            Write-Host "Added tags to $($_.FullName)"
        } else {
            Write-Host "Warning: No <head> found in $($_.FullName)"
        }
    } else {
        Write-Host "Tags already exist in $($_.FullName)"
    }
}
