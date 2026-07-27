$f = "E:\novel-assistant\src-tauri\src\lib.rs"
$c = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

$old = 'fn count_words'
$idx = $c.IndexOf($old)
$end = $c.IndexOf('fn list_entries', $idx) - 2

$newFn = @'
fn count_words(text: &str) -> usize {
    let mut count = 0;
    let mut in_word = false;
    for ch in text.chars() {
        let is_cjk = matches!(ch,
            '\u{4E00}'..='\u{9FFF}'
            | '\u{3400}'..='\u{4DBF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{3000}'..='\u{303F}'
            | '\u{FF00}'..='\u{FFEF}'
            | '\u{2E80}'..='\u{2EFF}'
            | '\u{31C0}'..='\u{31EF}'
        );
        if is_cjk { count += 1; in_word = false; }
        else if ch.is_alphanumeric() { if !in_word { count += 1; in_word = true; } }
        else { in_word = false; }
    }
    count
}
'@

$c = $c.Substring(0, $idx) + $newFn + "`r`n`r`n" + $c.Substring($end)
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "done"
