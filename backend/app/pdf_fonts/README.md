# Fonts for report downloads

These are static 400 (Regular) and 700 (Bold) instances of Noto Sans CJK TC, embedded
and subset by ReportLab. They cover Latin text and Traditional/Simplified Chinese
without relying on fonts installed on the server or the reader's computer.

Source: [Noto CJK variable TrueType fonts](https://github.com/notofonts/noto-cjk/tree/main/Sans/Variable/TTF).
The source `NotoSansCJKtc-VF.ttf` SHA-256 is
`6b40dd16cf1b73b5a7a0ed2472d641b60e3e85e87211abd20009f67d841425da`.
The accompanying `OFL.txt` applies to both generated static files.

The instances were created with fontTools 4.62.1:

```python
font = TTFont(source_path)
subsetter = Subsetter(options=Options())
subsetter.populate(unicodes=range(0x10000))
subsetter.subset(font)
font = instantiateVariableFont(font, {"wght": weight}, inplace=True)
```

Name records 1, 2, 3, 4 and 6 were updated to the Murmi Noto Sans CJK TC family and
the corresponding Regular/Bold style. Distinct PostScript names ensure that PDF
font registration does not collapse the two weights into one. All supported Basic
Multilingual Plane characters (U+0000-U+FFFF) are retained. The full CJK source is
intentional: the smaller Google Fonts TC web subset omits common Simplified Chinese
characters needed by mixed transcripts. Supplementary-plane characters such as
emoji and rare CJK extensions are outside this font bundle. fontTools is only
needed to rebuild these assets, not at runtime.
